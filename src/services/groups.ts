import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { budgets, groups, invitations, memberships, participants, users } from "@/db/schema";
import { getCurrency } from "@/domain/money/currency";
import { parsePositiveMoneyToMinor } from "@/domain/money/money";
import { AppError } from "@/lib/errors";
import { getMembership, requireGroupRole, requireWritableGroup } from "@/auth/rbac";
import { createOpaqueToken, hashToken } from "@/auth/tokens";
import type { z } from "zod";
import type { groupCreateSchema, invitationCreateSchema } from "@/validation/schemas";
import { recordAudit } from "./audit";
import {
  getGroupTotals,
  listBudgets,
  listParticipants,
  listPendingInvitations,
} from "@/repositories/groups";
import { getParticipantBalances, listRecentAuditEvents } from "@/repositories/ledger";
import { getRecentExpenses } from "@/repositories/expenses";

export type Actor = { id: string; displayName: string; email: string };
const INVITE_TTL_DAYS = 7;

function normalizeEmails(invites: { email: string; role: "EDITOR" | "MEMBER" }[], actorEmail: string) {
  const seen = new Set<string>();
  const result: { email: string; role: "EDITOR" | "MEMBER" }[] = [];
  for (const invite of invites) {
    const email = invite.email.toLowerCase();
    if (email === actorEmail.toLowerCase()) {
      throw new AppError("VALIDATION_ERROR", "You cannot invite your own account. Add your own participant profile instead.");
    }
    if (seen.has(email)) continue;
    seen.add(email);
    result.push({ email, role: invite.role });
  }
  return result;
}

export async function createGroup(actor: Actor, input: z.infer<typeof groupCreateSchema>) {
  const currency = getCurrency(input.currency);
  const budgetMinor =
    input.budget && input.budget.trim().length > 0
      ? parsePositiveMoneyToMinor(input.budget, currency.code)
      : null;
  const invites = normalizeEmails(input.invites, actor.email);
  const now = Date.now();

  return db.transaction(async (tx) => {
    const groupRows = await tx
      .insert(groups)
      .values({
        name: input.name,
        ownerId: actor.id,
        currency: currency.code,
        currencyPrecision: currency.precision,
        budgetMinor,
      })
      .returning();
    const group = groupRows[0];
    if (!group) throw new AppError("INTERNAL_ERROR", "Group could not be created.");

    await tx.insert(memberships).values({ groupId: group.id, userId: actor.id, role: "OWNER" });
    await tx.insert(participants).values({
      groupId: group.id,
      userId: actor.id,
      displayName: actor.displayName,
      createdBy: actor.id,
    });

    const createdInvites: { email: string; role: "EDITOR" | "MEMBER"; token: string; expiresAt: Date }[] = [];
    for (const invite of invites) {
      const token = createOpaqueToken(24);
      const expiresAt = new Date(now + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
      await tx.insert(invitations).values({
        groupId: group.id,
        email: invite.email,
        role: invite.role,
        tokenHash: hashToken(token),
        invitedBy: actor.id,
        expiresAt,
      });
      createdInvites.push({ ...invite, token, expiresAt });
    }

    await recordAudit(tx, {
      groupId: group.id,
      actorId: actor.id,
      action: "GROUP_CREATED",
      targetType: "group",
      targetId: group.id,
      metadata: { currency: currency.code, budgetMinor: budgetMinor?.toString() ?? null },
    });
    if (createdInvites.length > 0) {
      await recordAudit(tx, {
        groupId: group.id,
        actorId: actor.id,
        action: "INVITATIONS_CREATED",
        targetType: "invitation",
        metadata: { count: createdInvites.length, emails: createdInvites.map((invite) => invite.email) },
      });
    }

    return { group, invites: createdInvites };
  });
}

export async function getGroupOverview(groupId: string, userId: string) {
  const membership = await requireGroupRole(groupId, userId, "MEMBER");
  const [groupRow] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!groupRow) throw new AppError("NOT_FOUND", "Group not found.");
  const [participantData, totals, budgetRows, recentExpenses, recentAudit, pendingInvites] = await Promise.all([
    getParticipantBalances(groupId),
    getGroupTotals(groupId),
    listBudgets(groupId),
    getRecentExpenses(groupId, 6),
    listRecentAuditEvents(groupId, 6),
    listPendingInvitations(groupId),
  ]);
  return {
    membership,
    group: groupRow,
    ...participantData,
    totals,
    budgets: budgetRows,
    recentExpenses,
    recentAudit,
    pendingInvites,
    allParticipants: await listParticipants(groupId),
  };
}

export async function createInvitation(
  actor: Actor,
  groupId: string,
  input: z.infer<typeof invitationCreateSchema>,
) {
  await requireWritableGroup(groupId, actor.id, "OWNER");
  const email = input.email.toLowerCase();
  if (email === actor.email.toLowerCase()) {
    throw new AppError("VALIDATION_ERROR", "You are already the owner of this group.");
  }
  const existingMember = await db
    .select({ id: memberships.id })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.groupId, groupId),
        eq(memberships.status, "ACTIVE"),
        sql`lower(${users.email}) = ${email}`,
      ),
    )
    .limit(1);
  if (existingMember[0]) {
    throw new AppError("CONFLICT", "That person is already an active member of this group.");
  }

  const token = createOpaqueToken(24);
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.transaction(async (tx) => {
    await tx
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(invitations.groupId, groupId),
          eq(invitations.email, email),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      );
    const rows = await tx
      .insert(invitations)
      .values({
        groupId,
        email,
        role: input.role,
        tokenHash: hashToken(token),
        invitedBy: actor.id,
        expiresAt,
      })
      .returning({ id: invitations.id });
    await recordAudit(tx, {
      groupId,
      actorId: actor.id,
      action: "INVITATION_CREATED",
      targetType: "invitation",
      targetId: rows[0]?.id ?? null,
      metadata: { email, role: input.role },
    });
  });
  return { token, expiresAt };
}

export async function addParticipant(actor: Actor, groupId: string, displayName: string) {
  await requireWritableGroup(groupId, actor.id, "EDITOR");
  const rows = await db
    .insert(participants)
    .values({ groupId, displayName, createdBy: actor.id })
    .returning();
  const participant = rows[0];
  if (!participant) throw new AppError("INTERNAL_ERROR", "Participant could not be added.");
  await db.transaction(async (tx) => {
    await recordAudit(tx, {
      groupId,
      actorId: actor.id,
      action: "PARTICIPANT_ADDED",
      targetType: "participant",
      targetId: participant.id,
      metadata: { displayName },
    });
  });
  return participant;
}

export async function setParticipantStatus(actor: Actor, groupId: string, participantId: string, status: "ACTIVE" | "INACTIVE") {
  const membership = await requireWritableGroup(groupId, actor.id, "EDITOR");
  if (status === "INACTIVE") {
    const target = await db
      .select({ userId: participants.userId })
      .from(participants)
      .where(and(eq(participants.id, participantId), eq(participants.groupId, groupId)))
      .limit(1);
    if (!target[0]) throw new AppError("NOT_FOUND", "Participant not found.");
    if (target[0].userId === membership.ownerId) {
      throw new AppError("CONFLICT", "The owner's participant profile must stay active. Transfer ownership first.");
    }
  }
  const rows = await db
    .update(participants)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(participants.id, participantId), eq(participants.groupId, groupId)))
    .returning();
  if (!rows[0]) throw new AppError("NOT_FOUND", "Participant not found.");
  await db.transaction(async (tx) => {
    await recordAudit(tx, {
      groupId,
      actorId: actor.id,
      action: status === "ACTIVE" ? "PARTICIPANT_REACTIVATED" : "PARTICIPANT_DEACTIVATED",
      targetType: "participant",
      targetId: participantId,
    });
  });
}

export async function changeMemberRole(actor: Actor, groupId: string, targetUserId: string, role: "EDITOR" | "MEMBER") {
  const membership = await requireWritableGroup(groupId, actor.id, "OWNER");
  if (targetUserId === membership.ownerId) {
    throw new AppError("CONFLICT", "Transfer ownership before changing the owner's role.");
  }
  const rows = await db
    .update(memberships)
    .set({ role, updatedAt: new Date() })
    .where(and(eq(memberships.groupId, groupId), eq(memberships.userId, targetUserId), eq(memberships.status, "ACTIVE")))
    .returning();
  if (!rows[0]) throw new AppError("NOT_FOUND", "Active member not found.");
  await db.transaction(async (tx) => {
    await recordAudit(tx, {
      groupId,
      actorId: actor.id,
      action: "MEMBER_ROLE_CHANGED",
      targetType: "membership",
      targetId: targetUserId,
      metadata: { role },
    });
  });
}

export async function transferOwnership(actor: Actor, groupId: string, targetUserId: string) {
  const membership = await requireWritableGroup(groupId, actor.id, "OWNER");
  if (targetUserId === actor.id) throw new AppError("VALIDATION_ERROR", "Choose another member.");
  const target = await db
    .select({ id: memberships.id, displayName: users.displayName })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.groupId, groupId), eq(memberships.userId, targetUserId), eq(memberships.status, "ACTIVE")))
    .limit(1);
  if (!target[0]) throw new AppError("NOT_FOUND", "Active member not found.");
  const targetMember = target[0];

  await db.transaction(async (tx) => {
    const linked = await tx
      .select({ id: participants.id })
      .from(participants)
      .where(and(eq(participants.groupId, groupId), eq(participants.userId, targetUserId)))
      .limit(1);
    if (!linked[0]) {
      await tx.insert(participants).values({
        groupId,
        userId: targetUserId,
        displayName: targetMember.displayName,
        createdBy: actor.id,
      });
    }
    await tx.update(groups).set({ ownerId: targetUserId, updatedAt: new Date() }).where(eq(groups.id, groupId));
    await tx
      .update(memberships)
      .set({ role: "EDITOR", updatedAt: new Date() })
      .where(and(eq(memberships.groupId, groupId), eq(memberships.userId, actor.id)));
    await tx
      .update(memberships)
      .set({ role: "OWNER", updatedAt: new Date() })
      .where(and(eq(memberships.groupId, groupId), eq(memberships.userId, targetUserId)));
    await recordAudit(tx, {
      groupId,
      actorId: actor.id,
      action: "OWNERSHIP_TRANSFERRED",
      targetType: "membership",
      targetId: targetUserId,
      metadata: { from: membership.ownerId, to: targetUserId },
    });
  });
}

export async function removeMember(actor: Actor, groupId: string, targetUserId: string) {
  const membership = await requireWritableGroup(groupId, actor.id, "OWNER");
  if (targetUserId === membership.ownerId) {
    throw new AppError("CONFLICT", "The owner cannot be removed. Transfer ownership first.");
  }
  await db.transaction(async (tx) => {
    const rows = await tx
      .update(memberships)
      .set({ status: "REMOVED", updatedAt: new Date() })
      .where(and(eq(memberships.groupId, groupId), eq(memberships.userId, targetUserId), eq(memberships.status, "ACTIVE")))
      .returning({ id: memberships.id });
    if (!rows[0]) throw new AppError("NOT_FOUND", "Active member not found.");
    await tx
      .update(participants)
      .set({ status: "INACTIVE", updatedAt: new Date() })
      .where(and(eq(participants.groupId, groupId), eq(participants.userId, targetUserId)));
    await recordAudit(tx, {
      groupId,
      actorId: actor.id,
      action: "MEMBER_REMOVED",
      targetType: "membership",
      targetId: targetUserId,
    });
  });
}

export async function setGroupArchived(actor: Actor, groupId: string, archived: boolean) {
  await requireGroupRole(groupId, actor.id, "OWNER");
  await db.transaction(async (tx) => {
    await tx
      .update(groups)
      .set({ status: archived ? "ARCHIVED" : "ACTIVE", archivedAt: archived ? new Date() : null, updatedAt: new Date() })
      .where(eq(groups.id, groupId));
    await recordAudit(tx, {
      groupId,
      actorId: actor.id,
      action: archived ? "GROUP_ARCHIVED" : "GROUP_RESTORED",
      targetType: "group",
      targetId: groupId,
    });
  });
}

export async function deleteGroup(actor: Actor, groupId: string, confirmation: string) {
  await requireGroupRole(groupId, actor.id, "OWNER");
  const group = await db.select({ name: groups.name }).from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!group[0]) throw new AppError("NOT_FOUND", "Group not found.");
  if (confirmation.trim() !== group[0].name) {
    throw new AppError("VALIDATION_ERROR", "Type the exact group name to confirm deletion.");
  }
  await db.delete(groups).where(eq(groups.id, groupId));
}

export async function setBudget(actor: Actor, groupId: string, input: { scope: "OVERALL" | "CATEGORY"; category?: string; period: "MONTHLY" | "ALL_TIME"; limit: string }) {
  const membership = await requireWritableGroup(groupId, actor.id, "EDITOR");
  if (input.scope === "OVERALL" && input.period !== "MONTHLY") {
    throw new AppError("VALIDATION_ERROR", "The group budget is tracked monthly. Choose monthly for an overall limit.");
  }
  const limitMinor = parsePositiveMoneyToMinor(input.limit, membership.currency);
  if (input.scope === "OVERALL") {
    await db.transaction(async (tx) => {
      await tx.update(groups).set({ budgetMinor: limitMinor, updatedAt: new Date() }).where(eq(groups.id, groupId));
      await recordAudit(tx, {
        groupId,
        actorId: actor.id,
        action: "BUDGET_UPDATED",
        targetType: "group",
        targetId: groupId,
        metadata: { scope: "OVERALL", period: "MONTHLY", limitMinor: limitMinor.toString() },
      });
    });
    return;
  }
  if (!input.category) throw new AppError("VALIDATION_ERROR", "Choose a category for a category budget.");
  await db.transaction(async (tx) => {
    await tx
      .insert(budgets)
      .values({
        groupId,
        scope: "CATEGORY",
        category: input.category as string,
        period: input.period,
        limitMinor,
        createdBy: actor.id,
      })
      .onConflictDoUpdate({
        target: [budgets.groupId, budgets.scope, budgets.period, budgets.category],
        set: { limitMinor, updatedAt: new Date() },
      });
    await recordAudit(tx, {
      groupId,
      actorId: actor.id,
      action: "BUDGET_UPDATED",
      targetType: "budget",
      metadata: {
        scope: "CATEGORY",
        category: input.category,
        period: input.period,
        limitMinor: limitMinor.toString(),
      },
    });
  });
}

export async function checkGroupAccess(groupId: string, userId: string) {
  return getMembership(groupId, userId);
}

export async function invitationLink(groupId: string, token: string) {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/invite/${token}?group=${groupId}`;
}

export async function revokeInvitation(actor: Actor, groupId: string, invitationId: string) {
  await requireWritableGroup(groupId, actor.id, "OWNER");
  const rows = await db
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(invitations.id, invitationId), eq(invitations.groupId, groupId), gt(invitations.expiresAt, new Date())))
    .returning({ id: invitations.id });
  if (!rows[0]) throw new AppError("NOT_FOUND", "Pending invitation not found.");
  await db.transaction(async (tx) => {
    await recordAudit(tx, {
      groupId,
      actorId: actor.id,
      action: "INVITATION_REVOKED",
      targetType: "invitation",
      targetId: invitationId,
    });
  });
}
