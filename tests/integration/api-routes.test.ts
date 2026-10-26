import { beforeAll, describe, expect, it, vi } from "vitest";
import { consumeRateLimit } from "@/auth/rate-limit";
import { AppError } from "@/lib/errors";
import { errorResponse } from "@/lib/api";
import { createExpense } from "@/services/expenses";
import { GET as getExpenses, POST as postExpense } from "@/app/api/groups/[groupId]/expenses/route";
import { GET as getExpense, PATCH as patchExpense } from "@/app/api/expenses/[expenseId]/route";
import { GET as getBalances } from "@/app/api/groups/[groupId]/balances/route";
import { GET as getGroups } from "@/app/api/groups/route";
import { daysAgo, expectAppError, makeGroup, makeMember, makeUser, resetDatabase } from "./helpers";

const authState = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@/auth/session", () => ({
  SESSION_COOKIE: "settlewise_session",
  requireAuth: async () => {
    const { AppError: Err } = await import("@/lib/errors");
    if (!authState.userId) throw new Err("UNAUTHENTICATED", "Sign in to continue.");
    const [{ db }, { users }, { eq }] = await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
      import("drizzle-orm"),
    ]);
    const [user] = await db.select().from(users).where(eq(users.id, authState.userId)).limit(1);
    if (!user) throw new Err("UNAUTHENTICATED", "Sign in to continue.");
    return {
      user: { id: user.id, email: user.email, displayName: user.displayName, createdAt: user.createdAt },
      sessionId: "00000000-0000-4000-8000-000000000000",
      sessionCreatedAt: new Date(),
      sessionLastUsedAt: new Date(),
      expiresAt: new Date(),
      userAgent: null,
    };
  },
}));

const HOST = "http://settlewise.test";

function apiRequest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("host", new URL(HOST).host);
  headers.set("origin", HOST);
  return new Request(`${HOST}${path}`, { ...init, headers });
}

function context(params: Record<string, string>) {
  return { params: Promise.resolve(params) } as never;
}

async function envelope(response: Response) {
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(response.headers.get("cache-control")).toBe("no-store");
  return response.json();
}

describe("API error envelopes", () => {
  let owner: Awaited<ReturnType<typeof makeUser>>;
  let groupId: string;
  let ownerId: string;

  beforeAll(async () => {
    await resetDatabase();
    owner = await makeUser("Envelope Owner", "envelope-owner");
    const group = await makeGroup(owner, "Envelope group");
    groupId = group.id;
    ownerId = await makeMember(group.id, owner, "EDITOR", "Envelope Owner");
    authState.userId = owner.id;
  });

  it("returns 401 with a code and message when no session resolves", async () => {
    authState.userId = null;
    const response = await getGroups();
    expect(response.status).toBe(401);
    const body = await envelope(response);
    expect(body.error.code).toBe("UNAUTHENTICATED");
    expect(body.error.message).toBe("Sign in to continue.");
    authState.userId = owner.id;
  });

  it("maps every failure code to a stable status and envelope", async () => {
    const expected: [string, number][] = [
      ["VALIDATION_ERROR", 400],
      ["INVALID_MONEY", 400],
      ["UNSUPPORTED_CURRENCY", 400],
      ["AMOUNT_TOO_LARGE", 400],
      ["INVALID_ALLOCATION", 400],
      ["INVALID_PERCENTAGE", 400],
      ["INVALID_SHARES", 400],
      ["DUPLICATE_BENEFICIARY", 400],
      ["UNAUTHENTICATED", 401],
      ["FORBIDDEN", 403],
      ["PAYLOAD_TOO_LARGE", 413],
      ["RATE_LIMITED", 429],
      ["NOT_FOUND", 404],
      ["CONFLICT", 409],
      ["STALE_REVISION", 409],
      ["INVALID_STATE", 409],
      ["DUPLICATE_IMPORT", 409],
      ["IDEMPOTENCY_CONFLICT", 409],
      ["CURRENCY_MISMATCH", 409],
      ["BALANCE_INVARIANT", 500],
      ["INTERNAL_ERROR", 500],
    ];
    for (const [code, status] of expected) {
      const response = errorResponse(new AppError(code as never, `${code} message`, { probe: code }));
      expect(response.status).toBe(status);
      const body = await envelope(response);
      expect(body.error.code).toBe(code);
      expect(body.error.message).toBe(`${code} message`);
      expect(body.error.details).toEqual({ probe: code });
    }
  });

  it("limits repeated writes with a rate limit envelope", async () => {
    await consumeRateLimit(`api-route-test:${owner.id}`, 3, 60);
    await consumeRateLimit(`api-route-test:${owner.id}`, 3, 60);
    await consumeRateLimit(`api-route-test:${owner.id}`, 3, 60);
    const error = (await expectAppError(
      () => consumeRateLimit(`api-route-test:${owner.id}`, 3, 60),
      "RATE_LIMITED",
    )) as unknown as { details?: { retryAfterSeconds?: number } };
    expect(error.details?.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("returns 400 with the offending field for an invalid date filter", async () => {
    const response = await getExpenses(apiRequest(`/api/groups/${groupId}/expenses?from=bad`), context({ groupId }));
    expect(response.status).toBe(400);
    const body = await envelope(response);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toEqual({ path: "from" });
    expect(body.error.message).toContain("YYYY-MM-DD");
  });

  it("rejects an out-of-range page instead of trusting the client", async () => {
    const response = await getExpenses(apiRequest(`/api/groups/${groupId}/expenses?pageSize=9999`), context({ groupId }));
    expect(response.status).toBe(200);
    const body = await envelope(response);
    expect(body.pageSize).toBe(100);
  });

  it("hides a foreign group behind the same 404 as a missing group", async () => {
    const outsider = await makeUser("Envelope Outsider", "envelope-outsider");
    authState.userId = outsider.id;
    const forbidden = await getExpenses(apiRequest(`/api/groups/${groupId}/expenses`), context({ groupId }));
    expect(forbidden.status).toBe(404);
    expect((await envelope(forbidden)).error.code).toBe("NOT_FOUND");
    authState.userId = owner.id;
  });

  it("treats a malformed identifier as a client error instead of a crash", async () => {
    const response = await getExpenses(apiRequest("/api/groups/not-a-uuid/expenses"), context({ groupId: "not-a-uuid" }));
    expect(response.status).toBe(400);
    expect((await envelope(response)).error.code).toBe("VALIDATION_ERROR");
  });

  it("serializes BigInt minor units as JSON strings", async () => {
    await createExpense(owner, groupId, {
      description: "Envelope dinner",
      category: "DINING",
      occurredOn: daysAgo(2),
      payerParticipantId: ownerId,
      amount: "100.01",
      split: { method: "EQUAL", participantIds: [ownerId] },
    });
    const response = await getBalances(apiRequest(`/api/groups/${groupId}/balances`), context({ groupId }));
    expect(response.status).toBe(200);
    const raw = await response.text();
    expect(raw).not.toMatch(/\d+n\b/);
    const body = JSON.parse(raw);
    expect(typeof body.balances[0].netMinor).toBe("string");
    expect(body.balances[0].netMinor).toBe("0");
  });

  it("refuses a cross-group participant before any write", async () => {
    const otherGroup = await makeGroup(owner, "Envelope other group");
    const otherParticipant = await makeMember(otherGroup.id, owner, "EDITOR", "Envelope Owner");
    const response = await postExpense(
      apiRequest(`/api/groups/${groupId}/expenses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          description: "Wrong group payer",
          category: "OTHER",
          occurredOn: daysAgo(1),
          payerParticipantId: otherParticipant,
          amount: "50.00",
          split: { method: "EQUAL", participantIds: [ownerId] },
        }),
      }),
      context({ groupId }),
    );
    expect(response.status).toBe(400);
    const body = await envelope(response);
    expect(body.error.code).toBe("INVALID_ALLOCATION");
    expect(body.error.details.missing).toEqual([otherParticipant]);
    const list = await getExpenses(apiRequest(`/api/groups/${groupId}/expenses`), context({ groupId }));
    const listed = await envelope(list);
    expect(listed.total).toBe(1);
    await expectAppError(
      () => createExpense(owner, groupId, {
        description: "Wrong group beneficiary",
        category: "OTHER",
        occurredOn: daysAgo(1),
        payerParticipantId: ownerId,
        amount: "50.00",
        split: { method: "EQUAL", participantIds: [otherParticipant] },
      }),
      "INVALID_ALLOCATION",
    );
  });

  it("refuses a mutation sent without a trusted origin", async () => {
    const headers = new Headers({ host: new URL(HOST).host, "content-type": "application/json" });
    const response = await postExpense(
      new Request(`${HOST}/api/groups/${groupId}/expenses`, { method: "POST", headers, body: "{}" }),
      context({ groupId }),
    );
    expect(response.status).toBe(403);
    expect((await envelope(response)).error.code).toBe("FORBIDDEN");
  });

  it("rejects malformed and oversized JSON bodies with distinct codes", async () => {
    const malformed = await postExpense(
      apiRequest(`/api/groups/${groupId}/expenses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json",
      }),
      context({ groupId }),
    );
    expect(malformed.status).toBe(400);
    expect((await envelope(malformed)).error.message).toBe("Send a valid JSON body.");

    const oversized = await postExpense(
      apiRequest(`/api/groups/${groupId}/expenses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: "x".repeat(300_000) }),
      }),
      context({ groupId }),
    );
    expect(oversized.status).toBe(413);
    expect((await envelope(oversized)).error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("returns a stale revision envelope that reports the current revision", async () => {
    const created = await createExpense(owner, groupId, {
      description: "Revision guard",
      category: "OTHER",
      occurredOn: daysAgo(1),
      payerParticipantId: ownerId,
      amount: "60.00",
      split: { method: "EQUAL", participantIds: [ownerId] },
    });
    const detail = await getExpense(apiRequest(`/api/expenses/${created.expenseId}`), context({ expenseId: created.expenseId }));
    expect(detail.status).toBe(200);
    const loaded = await envelope(detail);
    expect(loaded.expense.revision).toBe(1);

    const correction = (amount: string, expectedRevision: number) =>
      JSON.stringify({
        description: loaded.expense.description,
        category: loaded.expense.category,
        occurredOn: loaded.expense.occurredOn,
        payerParticipantId: loaded.expense.payerParticipantId,
        amount,
        split: { method: "EQUAL", participantIds: [ownerId] },
        expectedRevision,
        reason: "Checked the printed receipt again",
      });

    const first = await patchExpense(
      apiRequest(`/api/expenses/${created.expenseId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: correction("61.00", 1),
      }),
      context({ expenseId: created.expenseId }),
    );
    expect(first.status).toBe(200);
    expect((await envelope(first)).revision).toBe(2);

    const stale = await patchExpense(
      apiRequest(`/api/expenses/${created.expenseId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: correction("62.00", 1),
      }),
      context({ expenseId: created.expenseId }),
    );
    expect(stale.status).toBe(409);
    const body = await envelope(stale);
    expect(body.error.code).toBe("STALE_REVISION");
    expect(body.error.details.currentRevision).toBe(2);

    const history = await envelope(
      await getExpense(apiRequest(`/api/expenses/${created.expenseId}`), context({ expenseId: created.expenseId })),
    );
    expect(history.expense.amountMinor).toBe("6100");
    expect(history.revisions.map((revision: { revision: number }) => revision.revision)).toEqual([2, 1]);
  });
});
