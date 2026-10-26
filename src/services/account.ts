import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  groups,
  invitations,
  memberships,
  participants,
  sessions,
  users,
} from "@/db/schema";
import { hashPassword, verifyPassword } from "@/auth/password";
import { AppError } from "@/lib/errors";
import { recordAudit } from "./audit";

export async function updateProfile(userId: string, displayName: string) {
  await db.transaction(async (tx) => {
    await tx.update(users).set({ displayName, updatedAt: new Date() }).where(eq(users.id, userId));
    const linked = await tx
      .select({ id: participants.id, groupId: participants.groupId })
      .from(participants)
      .where(eq(participants.userId, userId));
    for (const participant of linked) {
      await tx
        .update(participants)
        .set({ displayName, updatedAt: new Date() })
        .where(eq(participants.id, participant.id));
      await recordAudit(tx, {
        groupId: participant.groupId,
        actorId: userId,
        action: "PROFILE_NAME_UPDATED",
        targetType: "participant",
        targetId: participant.id,
        metadata: { displayName },
      });
    }
  });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user) throw new AppError("NOT_FOUND", "Account not found.");
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError("VALIDATION_ERROR", "Current password is incorrect.");
  }
  const passwordHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function getAccountOverview(userId: string) {
  const [user] = await db
    .select({ id: users.id, email: users.email, displayName: users.displayName, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new AppError("NOT_FOUND", "Account not found.");
  const ownedGroups = await db
    .select({ id: groups.id, name: groups.name, status: groups.status })
    .from(groups)
    .where(eq(groups.ownerId, userId));
  const membershipsList = await db
    .select({
      groupId: memberships.groupId,
      role: memberships.role,
      status: memberships.status,
      groupName: groups.name,
    })
    .from(memberships)
    .innerJoin(groups, eq(groups.id, memberships.groupId))
    .where(eq(memberships.userId, userId));
  const sessionRows = await db
    .select({ id: sessions.id, createdAt: sessions.createdAt, lastUsedAt: sessions.lastUsedAt, userAgent: sessions.userAgent, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .orderBy(sessions.createdAt);
  return { user, ownedGroups, memberships: membershipsList, sessions: sessionRows };
}

export async function exportAccountData(userId: string) {
  const overview = await getAccountOverview(userId);
  return {
    exportedAt: new Date().toISOString(),
    note: "This export covers account profile, memberships, and session metadata. Financial ledgers are exported per group from the reports page.",
    profile: {
      id: overview.user.id,
      email: overview.user.email,
      displayName: overview.user.displayName,
      createdAt: overview.user.createdAt.toISOString(),
    },
    ownedGroups: overview.ownedGroups,
    memberships: overview.memberships,
    sessions: overview.sessions.map((session) => ({
      createdAt: session.createdAt.toISOString(),
      lastUsedAt: session.lastUsedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      userAgent: session.userAgent,
    })),
  };
}

export async function deleteAccount(userId: string, password: string, confirmation: string) {
  if (confirmation !== "DELETE") throw new AppError("VALIDATION_ERROR", "Type DELETE to confirm.");
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user || user.anonymizedAt) throw new AppError("NOT_FOUND", "Account not found.");
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new AppError("VALIDATION_ERROR", "Password is incorrect.");
  }
  const owned = await db.select({ id: groups.id, name: groups.name }).from(groups).where(eq(groups.ownerId, userId));
  if (owned.length > 0) {
    throw new AppError("CONFLICT", "Transfer ownership or delete your groups before deleting this account.", {
      groups: owned,
    });
  }

  await db.transaction(async (tx) => {
    const placeholderHash = `scrypt$disabled$${Date.now()}`;
    await tx
      .update(users)
      .set({
        email: `deleted-${userId}@invalid.local`,
        displayName: "Former member",
        passwordHash: placeholderHash,
        disabledAt: new Date(),
        anonymizedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx
      .update(memberships)
      .set({ status: "REMOVED", updatedAt: new Date() })
      .where(and(eq(memberships.userId, userId), eq(memberships.status, "ACTIVE")));
    await tx
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(and(eq(invitations.invitedBy, userId), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)));
    const linked = await tx
      .select({ id: participants.id, groupId: participants.groupId })
      .from(participants)
      .where(eq(participants.userId, userId));
    for (const participant of linked) {
      await tx
        .update(participants)
        .set({
          userId: null,
          status: "INACTIVE",
          displayName: `Former member ${userId.slice(0, 8)}`,
          updatedAt: new Date(),
        })
        .where(eq(participants.id, participant.id));
      await recordAudit(tx, {
        groupId: participant.groupId,
        actorId: null,
        action: "ACCOUNT_ANONYMIZED",
        targetType: "participant",
        targetId: participant.id,
        metadata: { retention: "Financial records retained with anonymized participant name." },
      });
    }
  });
}
