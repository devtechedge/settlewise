import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, groups, invitations, memberships, participants, users } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { hashToken } from "./tokens";
import type { SessionUser } from "./session";

export type InvitationPreview = {
  groupName: string;
  inviterName: string;
  role: "EDITOR" | "MEMBER";
  email: string;
  expiresAt: Date;
  isExpired: boolean;
  isAccepted: boolean;
};

export async function previewInvitation(token: string): Promise<InvitationPreview> {
  const tokenHash = hashToken(token);
  const rows = await db
    .select({
      groupName: groups.name,
      inviterName: users.displayName,
      role: invitations.role,
      email: invitations.email,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
      revokedAt: invitations.revokedAt,
    })
    .from(invitations)
    .innerJoin(groups, eq(groups.id, invitations.groupId))
    .innerJoin(users, eq(users.id, invitations.invitedBy))
    .where(eq(invitations.tokenHash, tokenHash))
    .limit(1);
  const row = rows[0];
  if (!row || row.revokedAt) {
    throw new AppError("NOT_FOUND", "This invitation is not valid.");
  }
  return {
    groupName: row.groupName,
    inviterName: row.inviterName,
    role: row.role === "OWNER" ? "EDITOR" : row.role,
    email: row.email,
    expiresAt: row.expiresAt,
    isExpired: row.expiresAt.getTime() <= Date.now(),
    isAccepted: row.acceptedAt !== null,
  };
}

export async function acceptInvitation(token: string, user: SessionUser): Promise<{ groupId: string }> {
  const tokenHash = hashToken(token);
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, tokenHash))
      .limit(1)
      .for("update");
    const invitation = rows[0];
    if (!invitation || invitation.revokedAt) {
      throw new AppError("NOT_FOUND", "This invitation is not valid.");
    }
    if (invitation.acceptedAt) {
      const existing = await tx
        .select({ groupId: memberships.groupId })
        .from(memberships)
        .where(
          and(
            eq(memberships.groupId, invitation.groupId),
            eq(memberships.userId, user.id),
            eq(memberships.status, "ACTIVE"),
          ),
        )
        .limit(1);
      if (existing[0]) return { groupId: existing[0].groupId };
      throw new AppError("CONFLICT", "This invitation has already been accepted.");
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw new AppError("CONFLICT", "This invitation has expired. Ask the owner for a new one.");
    }
    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new AppError("FORBIDDEN", `This invitation was sent to ${invitation.email}. Sign in with that address.`);
    }

    const membershipRows = await tx
      .select()
      .from(memberships)
      .where(and(eq(memberships.groupId, invitation.groupId), eq(memberships.userId, user.id)))
      .limit(1);
    const existingMembership = membershipRows[0];
    if (existingMembership) {
      await tx
        .update(memberships)
        .set({ status: "ACTIVE", role: invitation.role === "OWNER" ? "EDITOR" : invitation.role, updatedAt: new Date() })
        .where(eq(memberships.id, existingMembership.id));
    } else {
      await tx.insert(memberships).values({
        groupId: invitation.groupId,
        userId: user.id,
        role: invitation.role === "OWNER" ? "EDITOR" : invitation.role,
      });
    }

    const linked = await tx
      .select()
      .from(participants)
      .where(and(eq(participants.groupId, invitation.groupId), eq(participants.userId, user.id)))
      .limit(1);
    if (!linked[0]) {
      const sameName = await tx
        .select()
        .from(participants)
        .where(
          and(
            eq(participants.groupId, invitation.groupId),
            isNull(participants.userId),
            sql`lower(${participants.displayName}) = lower(${user.displayName})`,
          ),
        )
        .limit(1);
      if (sameName[0]) {
        await tx
          .update(participants)
          .set({ userId: user.id, status: "ACTIVE", updatedAt: new Date() })
          .where(eq(participants.id, sameName[0].id));
      } else {
        await tx.insert(participants).values({
          groupId: invitation.groupId,
          userId: user.id,
          displayName: user.displayName,
          createdBy: user.id,
        });
      }
    }

    await tx
      .update(invitations)
      .set({ acceptedAt: new Date(), acceptedByUserId: user.id })
      .where(eq(invitations.id, invitation.id));

    await tx.insert(auditEvents).values({
      groupId: invitation.groupId,
      actorId: user.id,
      action: "INVITATION_ACCEPTED",
      targetType: "invitation",
      targetId: invitation.id,
      metadata: { email: invitation.email, role: invitation.role },
    });

    return { groupId: invitation.groupId };
  });
}
