import "server-only";
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { budgets, expenses, groups, invitations, memberships, participants, users } from "@/db/schema";

export async function getGroup(groupId: string) {
  const rows = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  return rows[0] ?? null;
}

export async function listGroupsForUser(userId: string) {
  return db
    .select({
      id: groups.id,
      name: groups.name,
      currency: groups.currency,
      status: groups.status,
      role: memberships.role,
      budgetMinor: groups.budgetMinor,
      createdAt: groups.createdAt,
      memberCount: sql<number>`(select count(*)::int from memberships m where m.group_id = ${groups.id} and m.status = 'ACTIVE')`,
      participantCount: sql<number>`(select count(*)::int from participants p where p.group_id = ${groups.id} and p.status = 'ACTIVE')`,
      totalMinor: sql<string>`coalesce((select sum(e.amount_minor)::text from expenses e where e.group_id = ${groups.id} and e.status = 'ACTIVE'), '0')`,
      expenseCount: sql<number>`(select count(*)::int from expenses e where e.group_id = ${groups.id} and e.status = 'ACTIVE')`,
    })
    .from(memberships)
    .innerJoin(groups, eq(groups.id, memberships.groupId))
    .where(and(eq(memberships.userId, userId), eq(memberships.status, "ACTIVE")))
    .orderBy(desc(groups.updatedAt));
}

export async function listParticipants(groupId: string) {
  return db
    .select({
      id: participants.id,
      displayName: participants.displayName,
      status: participants.status,
      userId: participants.userId,
      createdAt: participants.createdAt,
      linkedName: users.displayName,
      linkedEmail: users.email,
    })
    .from(participants)
    .leftJoin(users, eq(users.id, participants.userId))
    .where(eq(participants.groupId, groupId))
    .orderBy(asc(participants.displayName));
}

export async function listMembers(groupId: string) {
  return db
    .select({
      userId: users.id,
      displayName: users.displayName,
      email: users.email,
      role: memberships.role,
      status: memberships.status,
      joinedAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.groupId, groupId))
    .orderBy(asc(memberships.createdAt));
}

export async function listPendingInvitations(groupId: string) {
  return db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      createdAt: invitations.createdAt,
      inviterName: users.displayName,
    })
    .from(invitations)
    .innerJoin(users, eq(users.id, invitations.invitedBy))
    .where(
      and(
        eq(invitations.groupId, groupId),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(invitations.createdAt));
}

export async function listBudgets(groupId: string) {
  return db
    .select()
    .from(budgets)
    .where(eq(budgets.groupId, groupId))
    .orderBy(asc(budgets.scope), asc(budgets.category));
}

export async function getGroupTotals(groupId: string) {
  const [spend] = await db
    .select({
      total: sql<string>`coalesce(sum(case when ${expenses.status} = 'ACTIVE' then ${expenses.amountMinor} else 0 end)::text, '0')`,
      activeCount: sql<number>`count(*) filter (where ${expenses.status} = 'ACTIVE')::int`,
    })
    .from(expenses)
    .where(eq(expenses.groupId, groupId));
  return { totalMinor: BigInt(spend?.total ?? "0"), activeCount: spend?.activeCount ?? 0 };
}
