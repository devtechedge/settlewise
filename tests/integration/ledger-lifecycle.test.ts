import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses } from "@/db/schema";
import { listAuditEvents } from "@/services/audit";
import { createExpense, updateExpense, voidExpense, resolveExpenseAccess } from "@/services/expenses";
import { recordPayment, reversePayment } from "@/services/payments";
import { getExpenseDetail } from "@/repositories/expenses";
import { getParticipantBalances } from "@/repositories/ledger";
import { daysAgo, expectAppError, makeGroup, makeMember, makeUnlinkedParticipant, makeUser, resetDatabase } from "./helpers";

beforeAll(resetDatabase);

describe("expense lifecycle", () => {
  it("creates, corrects, and voids an expense while preserving immutable history", async () => {
    const owner = await makeUser("Owner One", "owner");
    const editor = await makeUser("Editor One", "editor");
    const member = await makeUser("Member One", "member");
    const group = await makeGroup(owner, "Lifecycle group");
    const ownerId = await makeMember(group.id, owner, "EDITOR", "Owner One");
    const editorId = await makeMember(group.id, editor, "EDITOR", "Editor One");
    const memberId = await makeMember(group.id, member, "MEMBER", "Member One");

    const created = await createExpense(owner, group.id, {
      description: "Shared dinner",
      category: "DINING",
      occurredOn: daysAgo(10),
      payerParticipantId: ownerId,
      amount: "1000.00",
      split: { method: "EQUAL", participantIds: [ownerId, editorId, memberId] },
    });

    const initialDetail = await getExpenseDetail(group.id, created.expenseId);
    expect(initialDetail?.splits.reduce((acc, row) => acc + row.allocatedMinor, 0n)).toBe(100000n);

    await updateExpense(owner, group.id, created.expenseId, {
      description: "Shared dinner corrected",
      category: "DINING",
      occurredOn: daysAgo(10),
      payerParticipantId: ownerId,
      amount: "1000.01",
      notes: "Receipt included tax",
      split: { method: "EQUAL", participantIds: [ownerId, editorId, memberId] },
      expectedRevision: 1,
      reason: "Added tax from the receipt",
    });
    const corrected = await getExpenseDetail(group.id, created.expenseId);
    expect(corrected?.expense.revision).toBe(2);
    expect(corrected?.expense.amountMinor).toBe(100001n);
    expect(corrected?.splits.reduce((acc, row) => acc + row.allocatedMinor, 0n)).toBe(100001n);

    await db.update(expenses).set({ revision: 5 }).where(eq(expenses.id, created.expenseId));
    await expectAppError(
      () => updateExpense(owner, group.id, created.expenseId, {
        description: "Should fail",
        category: "DINING",
        occurredOn: daysAgo(10),
        payerParticipantId: ownerId,
        amount: "100.00",
        split: { method: "EQUAL", participantIds: [ownerId] },
        expectedRevision: 2,
        reason: "Stale write",
      }),
      "STALE_REVISION",
    );

    await voidExpense(owner, group.id, created.expenseId, { expectedRevision: 5, reason: "Duplicate of another entry" });
    const balances = await getParticipantBalances(group.id);
    expect(balances.balances.every((row) => row.netMinor === 0n)).toBe(true);
    const detail = await getExpenseDetail(group.id, created.expenseId);
    expect(detail?.expense.status).toBe("VOID");
    expect(detail?.revisions.map((revision) => revision.revision)).toEqual([6, 2, 1]);

    const audit = await listAuditEvents(group.id, owner.id, { pageSize: 50 });
    expect(audit.rows.map((row) => row.action)).toEqual(
      expect.arrayContaining(["EXPENSE_CREATED", "EXPENSE_UPDATED", "EXPENSE_VOIDED"]),
    );
  });

  it("applies partial payments, idempotency, and exact reversal", async () => {
    const owner = await makeUser("Payer Owner", "payer-owner");
    const debtor = await makeUser("Payer Debtor", "payer-debtor");
    const group = await makeGroup(owner, "Payment group");
    const ownerId = await makeMember(group.id, owner, "EDITOR", "Payer Owner");
    const debtorId = await makeMember(group.id, debtor, "EDITOR", "Payer Debtor");

    await createExpense(owner, group.id, {
      description: "Rent",
      category: "RENT",
      occurredOn: daysAgo(8),
      payerParticipantId: ownerId,
      amount: "3000.00",
      split: { method: "EQUAL", participantIds: [ownerId, debtorId] },
    });

    const before = await getParticipantBalances(group.id);
    expect(before.balances.find((row) => row.participantId === debtorId)?.netMinor).toBe(-150000n);

    const payment = await recordPayment(owner, group.id, {
      senderParticipantId: debtorId,
      recipientParticipantId: ownerId,
      amount: "500.00",
      paidOn: daysAgo(2),
      notes: "Partial",
      idempotencyKey: "payment-1",
    });
    const afterPayment = await getParticipantBalances(group.id);
    expect(afterPayment.balances.find((row) => row.participantId === debtorId)?.netMinor).toBe(-100000n);
    expect(afterPayment.balances.find((row) => row.participantId === ownerId)?.netMinor).toBe(100000n);

    const replay = await recordPayment(owner, group.id, {
      senderParticipantId: debtorId,
      recipientParticipantId: ownerId,
      amount: "500.00",
      paidOn: daysAgo(2),
      notes: "Partial",
      idempotencyKey: "payment-1",
    });
    expect(replay).toEqual({ ...payment, replayed: true });
    await expectAppError(
      () => recordPayment(owner, group.id, {
        senderParticipantId: debtorId,
        recipientParticipantId: ownerId,
        amount: "900.00",
        paidOn: daysAgo(2),
        idempotencyKey: "payment-1",
      }),
      "IDEMPOTENCY_CONFLICT",
    );

    await expectAppError(
      () => recordPayment(owner, group.id, {
        senderParticipantId: debtorId,
        recipientParticipantId: ownerId,
        amount: "100000.00",
        paidOn: daysAgo(2),
        idempotencyKey: "payment-too-large",
      }),
      "INVALID_STATE",
    );

    await reversePayment(owner, payment.paymentId, { reason: "Entered the wrong amount", idempotencyKey: "reverse-1" });
    const restored = await getParticipantBalances(group.id);
    expect(restored.balances).toEqual(before.balances);
    const reversalReplay = await reversePayment(owner, payment.paymentId, {
      reason: "Entered the wrong amount",
      idempotencyKey: "reverse-1",
    });
    expect(reversalReplay.replayed).toBe(true);
  });

  it("rejects inactive beneficiaries, cross-group access, and invalid splits", async () => {
    const owner = await makeUser("Strict Owner", "strict-owner");
    const outsider = await makeUser("Outsider", "outsider");
    const group = await makeGroup(owner, "Strict group");
    const ownerId = await makeMember(group.id, owner, "EDITOR", "Strict Owner");
    const inactive = await makeUnlinkedParticipant(group.id, owner, "Inactive person");
    const { participants } = await import("@/db/schema");
    await db.update(participants).set({ status: "INACTIVE" }).where(eq(participants.id, inactive));

    await expectAppError(
      () => createExpense(owner, group.id, {
        description: "Should reject",
        category: "OTHER",
        occurredOn: daysAgo(1),
        payerParticipantId: ownerId,
        amount: "100.00",
        split: { method: "EQUAL", participantIds: [ownerId, inactive] },
      }),
      "INVALID_ALLOCATION",
    );

    const valid = await createExpense(owner, group.id, {
      description: "Valid",
      category: "OTHER",
      occurredOn: daysAgo(1),
      payerParticipantId: ownerId,
      amount: "100.00",
      split: { method: "EQUAL", participantIds: [ownerId] },
    });
    await expectAppError(() => resolveExpenseAccess(valid.expenseId, outsider.id), "NOT_FOUND");
    await expectAppError(
      () => createExpense(owner, group.id, {
        description: "Bad split",
        category: "OTHER",
        occurredOn: daysAgo(1),
        payerParticipantId: ownerId,
        amount: "100.00",
        split: {
          method: "EXACT",
          entries: [
            { participantId: ownerId, amount: "99.00" },
          ],
        },
      }),
      "INVALID_ALLOCATION",
    );
  });

  it("enforces the group currency at the database boundary", async () => {
    const owner = await makeUser("Currency Owner", "currency-owner");
    const group = await makeGroup(owner, "Currency group");
    const ownerId = await makeMember(group.id, owner, "EDITOR", "Currency Owner");
    let failed = false;
    try {
      await db.execute(sql`
        insert into expenses (id, group_id, description, category, occurred_on, payer_participant_id, currency, amount_minor, created_by, revision)
        values (gen_random_uuid(), ${group.id}, 'wrong currency', 'OTHER', ${daysAgo(1)}, ${ownerId}, 'USD', 100, ${owner.id}, 1)
      `);
    } catch (error) {
      failed = true;
      expect((error as { cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code).toBe("23503");
    }
    expect(failed).toBe(true);
  });

  it("produces the same settlement plan on repeated calculations", async () => {
    const owner = await makeUser("Repeat Owner", "repeat-owner");
    const a = await makeUser("Repeat A", "repeat-a");
    const b = await makeUser("Repeat B", "repeat-b");
    const group = await makeGroup(owner, "Repeatable group");
    const ownerId = await makeMember(group.id, owner, "EDITOR", "Repeat Owner");
    const aId = await makeMember(group.id, a, "EDITOR", "Repeat A");
    const bId = await makeMember(group.id, b, "EDITOR", "Repeat B");
    await createExpense(owner, group.id, {
      description: "Trip",
      category: "TRAVEL",
      occurredOn: daysAgo(4),
      payerParticipantId: ownerId,
      amount: "1000.01",
      split: { method: "EQUAL", participantIds: [ownerId, aId, bId] },
    });
    await createExpense(a, group.id, {
      description: "Fuel",
      category: "TRANSPORT",
      occurredOn: daysAgo(3),
      payerParticipantId: aId,
      amount: "500.00",
      split: { method: "EQUAL", participantIds: [aId, bId] },
    });
    const first = await getParticipantBalances(group.id);
    const second = await getParticipantBalances(group.id);
    expect(first.plan.transfers).toEqual(second.plan.transfers);
    expect(first.plan.totalMinor).toBe(first.plan.debtorTotalMinor);
    expect(first.plan.totalMinor).toBe(first.plan.creditorTotalMinor);
    expect(
      await db
        .select({ value: sql<number>`count(*)::int` })
        .from(expenses)
        .where(and(eq(expenses.groupId, group.id), eq(expenses.status, "ACTIVE"))),
    ).toEqual([{ value: 2 }]);
  });
});
