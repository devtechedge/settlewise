import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { groups, invitations, memberships, participants, sessions, users } from "@/db/schema";
import { createInvitation, addParticipant, setGroupArchived, setParticipantStatus, transferOwnership } from "@/services/groups";
import { createExpense } from "@/services/expenses";
import { recordPayment, reversePayment } from "@/services/payments";
import { acceptInvitation } from "@/auth/invitations";
import { deleteAccount } from "@/services/account";
import { hashToken } from "@/auth/tokens";
import { daysAgo, expectAppError, makeGroup, makeMember, makeUser, resetDatabase } from "./helpers";

beforeAll(resetDatabase);

describe("invitations and roles", () => {
  it("accepts a valid invitation and rejects the wrong account or an expired token", async () => {
    const owner = await makeUser("Invite Owner", "invite-owner");
    const invited = await makeUser("Invited Person", "invited");
    const stranger = await makeUser("Stranger", "stranger");
    const group = await makeGroup(owner, "Invitation group");
    const invitation = await createInvitation(owner, group.id, { email: invited.email, role: "EDITOR" });

    await expectAppError(() => acceptInvitation(invitation.token, stranger), "FORBIDDEN");
    await db.update(invitations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invitations.tokenHash, hashToken(invitation.token)));
    await expectAppError(() => acceptInvitation(invitation.token, invited), "CONFLICT");
  });

  it("lets members record only their own payments and owners reverse any payment", async () => {
    const owner = await makeUser("Role Owner", "role-owner");
    const member = await makeUser("Role Member", "role-member");
    const other = await makeUser("Role Other", "role-other");
    const group = await makeGroup(owner, "Role group");
    const ownerId = await makeMember(group.id, owner, "EDITOR", "Role Owner");
    const memberId = await makeMember(group.id, member, "MEMBER", "Role Member");
    const otherId = await makeMember(group.id, other, "MEMBER", "Role Other");
    await createExpense(owner, group.id, {
      description: "Shared meal",
      category: "DINING",
      occurredOn: daysAgo(3),
      payerParticipantId: ownerId,
      amount: "300.00",
      split: { method: "EQUAL", participantIds: [ownerId, memberId, otherId] },
    });

    const own = await recordPayment(member, group.id, {
      senderParticipantId: memberId,
      recipientParticipantId: ownerId,
      amount: "50.00",
      paidOn: daysAgo(1),
      idempotencyKey: "member-own",
    });
    await expectAppError(
      () => recordPayment(member, group.id, {
        senderParticipantId: otherId,
        recipientParticipantId: ownerId,
        amount: "50.00",
        paidOn: daysAgo(1),
        idempotencyKey: "member-other",
      }),
      "FORBIDDEN",
    );
    await expectAppError(
      () => recordPayment(member, group.id, {
        senderParticipantId: memberId,
        recipientParticipantId: otherId,
        amount: "10.00",
        paidOn: daysAgo(1),
        idempotencyKey: "member-to-noncreditor",
      }),
      "INVALID_STATE",
    );
    await expectAppError(
      () => reversePayment(other, own.paymentId, { reason: "not mine", idempotencyKey: "other-reverse" }), "FORBIDDEN");
    await reversePayment(owner, own.paymentId, { reason: "owner correction", idempotencyKey: "owner-reverse" });
  });

  it("enforces owner-only membership controls and keeps owner participants active", async () => {
    const owner = await makeUser("Control Owner", "control-owner");
    const editor = await makeUser("Control Editor", "control-editor");
    const group = await makeGroup(owner, "Control group");
    const ownerId = await makeMember(group.id, owner, "EDITOR", "Control Owner");
    const editorId = await makeMember(group.id, editor, "EDITOR", "Control Editor");
    await expectAppError(() => setParticipantStatus(owner, group.id, ownerId, "INACTIVE"), "CONFLICT");
    await addParticipant(editor, group.id, "Added by editor");
    await transferOwnership(owner, group.id, editor.id);
    const updatedGroup = await db.select().from(groups).where(eq(groups.id, group.id));
    expect(updatedGroup[0]?.ownerId).toBe(editor.id);
  });

  it("blocks writes to archived groups", async () => {
    const owner = await makeUser("Archive Owner", "archive-owner");
    const group = await makeGroup(owner, "Archive group");
    const ownerId = await makeMember(group.id, owner, "EDITOR", "Archive Owner");
    await setGroupArchived(owner, group.id, true);
    await expectAppError(
      () => createExpense(owner, group.id, {
        description: "Blocked",
        category: "OTHER",
        occurredOn: daysAgo(1),
        payerParticipantId: ownerId,
        amount: "100.00",
        split: { method: "EQUAL", participantIds: [ownerId] },
      }),
      "INVALID_STATE",
    );
    await setGroupArchived(owner, group.id, false);
    await createExpense(owner, group.id, {
      description: "Allowed after restore",
      category: "OTHER",
      occurredOn: daysAgo(1),
      payerParticipantId: ownerId,
      amount: "100.00",
      split: { method: "EQUAL", participantIds: [ownerId] },
    });
  });
});

describe("account deletion", () => {
  it("requires group ownership to be resolved and anonymizes retained ledger references", async () => {
    const owner = await makeUser("Delete Owner", "delete-owner");
    const heir = await makeUser("Delete Heir", "delete-heir");
    const group = await makeGroup(owner, "Delete group");
    const ownerId = await makeMember(group.id, owner, "EDITOR", "Delete Owner");
    const heirId = await makeMember(group.id, heir, "EDITOR", "Delete Heir");
    await createExpense(owner, group.id, {
      description: "Last expense",
      category: "OTHER",
      occurredOn: daysAgo(1),
      payerParticipantId: ownerId,
      amount: "100.00",
      split: { method: "EQUAL", participantIds: [ownerId, heirId] },
    });
    await expectAppError(() => deleteAccount(owner.id, owner.password, "DELETE"), "CONFLICT");

    await db.insert(sessions).values({
      userId: owner.id,
      tokenHash: hashToken("delete-test-token"),
      expiresAt: new Date(Date.now() + 86400000),
    });
    await transferOwnership(owner, group.id, heir.id);
    await deleteAccount(owner.id, owner.password, "DELETE");

    const [deleted] = await db.select().from(users).where(eq(users.id, owner.id));
    expect(deleted?.anonymizedAt).not.toBeNull();
    expect(deleted?.email).toContain("invalid.local");
    expect(deleted?.displayName).toBe("Former member");
    expect(await db.select().from(sessions).where(eq(sessions.userId, owner.id))).toHaveLength(0);
    const membership = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.groupId, group.id), eq(memberships.userId, owner.id)));
    expect(membership[0]?.status).toBe("REMOVED");
    const participant = await db.select().from(participants).where(eq(participants.id, ownerId));
    expect(participant[0]?.userId).toBeNull();
    expect(participant[0]?.displayName).toMatch(/^Former member /);
    expect(await db.select().from(users).where(isNull(users.anonymizedAt))).not.toHaveLength(0);
  });
});
