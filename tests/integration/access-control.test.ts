import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, expenses, groups, invitations, memberships, participants, sessions, users } from "@/db/schema";
import { createInvitation, addParticipant, deleteGroup, setGroupArchived, setParticipantStatus, transferOwnership } from "@/services/groups";
import { createExpense } from "@/services/expenses";
import { recordPayment, reversePayment } from "@/services/payments";
import { acceptInvitation } from "@/auth/invitations";
import { deleteAccount } from "@/services/account";
import { hashToken } from "@/auth/tokens";
import { daysAgo, expectAppError, makeGroup, makeMember, makeUnlinkedParticipant, makeUser, resetDatabase } from "./helpers";

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

  it("links a same-named participant and audits an accepted invitation", async () => {
    const owner = await makeUser("Accept Owner", "accept-owner");
    const invited = await makeUser("Accept Person", "accept-person");
    const group = await makeGroup(owner, "Acceptance group");
    const placeholder = await makeUnlinkedParticipant(group.id, owner, "accept person");
    const invitation = await createInvitation(owner, group.id, { email: invited.email, role: "MEMBER" });

    const result = await acceptInvitation(invitation.token, invited);
    expect(result.groupId).toBe(group.id);
    const [invitationRow] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, hashToken(invitation.token)));
    if (!invitationRow) throw new Error("Invitation row disappeared.");

    const [membership] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.groupId, group.id), eq(memberships.userId, invited.id)));
    expect(membership?.role).toBe("MEMBER");
    expect(membership?.status).toBe("ACTIVE");

    const linked = await db.select().from(participants).where(eq(participants.id, placeholder));
    expect(linked[0]?.userId).toBe(invited.id);
    expect(
      await db
        .select({ id: participants.id })
        .from(participants)
        .where(and(eq(participants.groupId, group.id), eq(participants.userId, invited.id))),
    ).toHaveLength(1);

    const [accepted] = await db.select().from(invitations).where(eq(invitations.id, invitationRow.id));
    expect(accepted?.acceptedAt).not.toBeNull();
    expect(accepted?.acceptedByUserId).toBe(invited.id);

    const audit = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.groupId, group.id), eq(auditEvents.action, "INVITATION_ACCEPTED")));
    expect(audit).toHaveLength(1);
    expect(audit[0]?.targetId).toBe(invitationRow.id);
    expect(audit[0]?.metadata).toEqual({ email: invited.email, role: "MEMBER" });

    await expect(acceptInvitation(invitation.token, invited)).resolves.toEqual({ groupId: group.id });
  });

  it("creates a participant for an accepted invitation when no name matches", async () => {
    const owner = await makeUser("Fresh Owner", "fresh-owner");
    const invited = await makeUser("Fresh Person", "fresh-person");
    const group = await makeGroup(owner, "Fresh member group");
    await makeUnlinkedParticipant(group.id, owner, "Someone else");
    const invitation = await createInvitation(owner, group.id, { email: invited.email, role: "EDITOR" });

    await acceptInvitation(invitation.token, invited);
    const rows = await db
      .select()
      .from(participants)
      .where(and(eq(participants.groupId, group.id), eq(participants.userId, invited.id)));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.displayName).toBe("Fresh Person");
    expect(rows[0]?.status).toBe("ACTIVE");
  });

  it("transfers ownership to a member who has no participant yet", async () => {
    const owner = await makeUser("Handover Owner", "handover-owner");
    const heir = await makeUser("Handover Heir", "handover-heir");
    const group = await makeGroup(owner, "Handover group");
    await makeMember(group.id, owner, "EDITOR", "Handover Owner");
    await db.insert(memberships).values({ groupId: group.id, userId: heir.id, role: "MEMBER" });

    await expectAppError(() => transferOwnership(owner, group.id, owner.id), "VALIDATION_ERROR");
    const stranger = await makeUser("Handover Stranger", "handover-stranger");
    await expectAppError(() => transferOwnership(owner, group.id, stranger.id), "NOT_FOUND");

    await transferOwnership(owner, group.id, heir.id);

    const [updated] = await db.select().from(groups).where(eq(groups.id, group.id));
    expect(updated?.ownerId).toBe(heir.id);
    const heirParticipant = await db
      .select()
      .from(participants)
      .where(and(eq(participants.groupId, group.id), eq(participants.userId, heir.id)));
    expect(heirParticipant).toHaveLength(1);
    expect(heirParticipant[0]?.displayName).toBe("Handover Heir");
    const [previousOwner] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.groupId, group.id), eq(memberships.userId, owner.id)));
    expect(previousOwner?.role).toBe("EDITOR");
    const audit = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.groupId, group.id), eq(auditEvents.action, "OWNERSHIP_TRANSFERRED")));
    expect(audit).toHaveLength(1);
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
    await makeMember(group.id, editor, "EDITOR", "Control Editor");
    await expectAppError(() => setParticipantStatus(owner, group.id, ownerId, "INACTIVE"), "CONFLICT");
    await addParticipant(editor, group.id, "Added by editor");
    await transferOwnership(owner, group.id, editor.id);
    const updatedGroup = await db.select().from(groups).where(eq(groups.id, group.id));
    expect(updatedGroup[0]?.ownerId).toBe(editor.id);
  });

  it("blocks writes to archived groups", async () => {
    const owner = await makeUser("Archive Owner", "archive-owner");
    const partner = await makeUser("Archive Partner", "archive-partner");
    const group = await makeGroup(owner, "Archive group");
    const ownerId = await makeMember(group.id, owner, "EDITOR", "Archive Owner");
    const partnerId = await makeMember(group.id, partner, "EDITOR", "Archive Partner");
    await createExpense(owner, group.id, {
      description: "Before archiving",
      category: "OTHER",
      occurredOn: daysAgo(2),
      payerParticipantId: ownerId,
      amount: "100.00",
      split: { method: "EQUAL", participantIds: [ownerId, partnerId] },
    });
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
    await expectAppError(() => addParticipant(owner, group.id, "Blocked participant"), "INVALID_STATE");
    await expectAppError(
      () => recordPayment(owner, group.id, {
        senderParticipantId: partnerId,
        recipientParticipantId: ownerId,
        amount: "50.00",
        paidOn: daysAgo(1),
        idempotencyKey: "archived-payment",
      }),
      "INVALID_STATE",
    );
    await setGroupArchived(owner, group.id, false);
    const allowed = await createExpense(owner, group.id, {
      description: "Allowed after restore",
      category: "OTHER",
      occurredOn: daysAgo(1),
      payerParticipantId: ownerId,
      amount: "100.00",
      split: { method: "EQUAL", participantIds: [ownerId] },
    });
    expect(allowed.expenseId).toBeTruthy();
    const payment = await recordPayment(owner, group.id, {
      senderParticipantId: partnerId,
      recipientParticipantId: ownerId,
      amount: "50.00",
      paidOn: daysAgo(1),
      idempotencyKey: "archived-payment",
    });
    expect(payment.status).toBe("RECORDED");
  });

  it("deletes a group only on an exact name confirmation and cascades its ledger", async () => {
    const owner = await makeUser("Purge Owner", "purge-owner");
    const editor = await makeUser("Purge Editor", "purge-editor");
    const group = await makeGroup(owner, "Purge group");
    const ownerId = await makeMember(group.id, owner, "EDITOR", "Purge Owner");
    await makeMember(group.id, editor, "EDITOR", "Purge Editor");
    const expense = await createExpense(owner, group.id, {
      description: "Purge expense",
      category: "OTHER",
      occurredOn: daysAgo(1),
      payerParticipantId: ownerId,
      amount: "100.00",
      split: { method: "EQUAL", participantIds: [ownerId] },
    });

    await expectAppError(() => deleteGroup(editor, group.id, "Purge group"), "FORBIDDEN");
    await expectAppError(() => deleteGroup(owner, group.id, "Purge"), "VALIDATION_ERROR");
    expect(await db.select().from(expenses).where(eq(expenses.id, expense.expenseId))).toHaveLength(1);

    await deleteGroup(owner, group.id, "Purge group");
    expect(await db.select().from(groups).where(eq(groups.id, group.id))).toHaveLength(0);
    expect(await db.select().from(expenses).where(eq(expenses.id, expense.expenseId))).toHaveLength(0);
    expect(await db.select().from(auditEvents).where(eq(auditEvents.groupId, group.id))).toHaveLength(0);
    await expectAppError(() => deleteGroup(owner, group.id, "Purge group"), "NOT_FOUND");
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
