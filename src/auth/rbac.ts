import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { groups, memberships } from "@/db/schema";
import { AppError } from "@/lib/errors";

export type GroupRole = "OWNER" | "EDITOR" | "MEMBER";

const ROLE_RANK: Record<GroupRole, number> = { MEMBER: 1, EDITOR: 2, OWNER: 3 };

export function hasRole(actual: GroupRole, required: GroupRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

export async function getMembership(groupId: string, userId: string) {
  const rows = await db
    .select({
      id: memberships.id,
      role: memberships.role,
      status: memberships.status,
      groupStatus: groups.status,
      groupName: groups.name,
      currency: groups.currency,
      ownerId: groups.ownerId,
    })
    .from(memberships)
    .innerJoin(groups, eq(groups.id, memberships.groupId))
    .where(and(eq(memberships.groupId, groupId), eq(memberships.userId, userId), eq(memberships.status, "ACTIVE")))
    .limit(1);
  return rows[0] ?? null;
}

export async function requireGroupRole(groupId: string, userId: string, required: GroupRole = "MEMBER") {
  const membership = await getMembership(groupId, userId);
  if (!membership) {
    throw new AppError("NOT_FOUND", "Group not found.");
  }
  if (!hasRole(membership.role, required)) {
    throw new AppError("FORBIDDEN", "Your group role does not allow this action.");
  }
  return membership;
}

export async function requireWritableGroup(groupId: string, userId: string, required: GroupRole = "MEMBER") {
  const membership = await requireGroupRole(groupId, userId, required);
  if (membership.groupStatus !== "ACTIVE") {
    throw new AppError("INVALID_STATE", "This group is archived. Restore it before making changes.");
  }
  return membership;
}


export function canEditTransactions(role: GroupRole): boolean {
  return hasRole(role, "EDITOR");
}

export function canManagePeople(role: GroupRole): boolean {
  return hasRole(role, "EDITOR");
}
