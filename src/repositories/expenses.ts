import { and, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses, expenseRevisions, expenseSplits, participants, users } from "@/db/schema";

export type ExpenseFilters = {
  groupId: string;
  query?: string;
  category?: string;
  payerParticipantId?: string;
  from?: string;
  to?: string;
  status?: "ACTIVE" | "VOID";
  page?: number;
  pageSize?: number;
};

export async function listExpenses(filters: ExpenseFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));
  const conditions = [eq(expenses.groupId, filters.groupId)];
  if (filters.query) {
    const escaped = filters.query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
    conditions.push(ilike(expenses.description, `%${escaped}%`));
  }
  if (filters.category) conditions.push(eq(expenses.category, filters.category));
  if (filters.payerParticipantId) conditions.push(eq(expenses.payerParticipantId, filters.payerParticipantId));
  if (filters.from) conditions.push(gte(expenses.occurredOn, filters.from));
  if (filters.to) conditions.push(lte(expenses.occurredOn, filters.to));
  if (filters.status) conditions.push(eq(expenses.status, filters.status));
  const where = and(...conditions);

  const [countRow] = await db.select({ count: sql<number>`count(*)::int` }).from(expenses).where(where);
  const rows = await db
    .select({
      id: expenses.id,
      description: expenses.description,
      category: expenses.category,
      occurredOn: expenses.occurredOn,
      amountMinor: expenses.amountMinor,
      currency: expenses.currency,
      status: expenses.status,
      revision: expenses.revision,
      payerId: participants.id,
      payerName: participants.displayName,
      createdAt: expenses.createdAt,
      splitCount: sql<number>`(select count(*)::int from expense_splits s where s.expense_id = ${expenses.id})`,
    })
    .from(expenses)
    .innerJoin(participants, eq(participants.id, expenses.payerParticipantId))
    .where(where)
    .orderBy(desc(expenses.occurredOn), desc(expenses.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const total = countRow?.count ?? 0;
  return {
    rows,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getExpenseDetail(groupId: string, expenseId: string) {
  const rows = await db
    .select({
      id: expenses.id,
      groupId: expenses.groupId,
      description: expenses.description,
      category: expenses.category,
      occurredOn: expenses.occurredOn,
      payerParticipantId: expenses.payerParticipantId,
      payerName: participants.displayName,
      currency: expenses.currency,
      amountMinor: expenses.amountMinor,
      notes: expenses.notes,
      status: expenses.status,
      revision: expenses.revision,
      voidedAt: expenses.voidedAt,
      voidReason: expenses.voidReason,
      createdAt: expenses.createdAt,
      updatedAt: expenses.updatedAt,
      createdByName: users.displayName,
    })
    .from(expenses)
    .innerJoin(participants, eq(participants.id, expenses.payerParticipantId))
    .innerJoin(users, eq(users.id, expenses.createdBy))
    .where(and(eq(expenses.id, expenseId), eq(expenses.groupId, groupId)))
    .limit(1);
  const expense = rows[0];
  if (!expense) return null;

  const splits = await db
    .select({
      participantId: expenseSplits.participantId,
      displayName: participants.displayName,
      allocatedMinor: expenseSplits.allocatedMinor,
      method: expenseSplits.method,
      basisPoints: expenseSplits.basisPoints,
      shares: expenseSplits.shares,
    })
    .from(expenseSplits)
    .innerJoin(participants, eq(participants.id, expenseSplits.participantId))
    .where(eq(expenseSplits.expenseId, expenseId))
    .orderBy(participants.displayName);

  const revisions = await db
    .select({
      id: expenseRevisions.id,
      revision: expenseRevisions.revision,
      action: expenseRevisions.action,
      reason: expenseRevisions.reason,
      createdAt: expenseRevisions.createdAt,
      actorName: users.displayName,
      beforeSnapshot: expenseRevisions.beforeSnapshot,
      afterSnapshot: expenseRevisions.afterSnapshot,
    })
    .from(expenseRevisions)
    .leftJoin(users, eq(users.id, expenseRevisions.actorId))
    .where(eq(expenseRevisions.expenseId, expenseId))
    .orderBy(desc(expenseRevisions.revision));

  return { expense, splits, revisions };
}

export async function getRecentExpenses(groupId: string, limit = 5) {
  return db
    .select({
      id: expenses.id,
      description: expenses.description,
      occurredOn: expenses.occurredOn,
      amountMinor: expenses.amountMinor,
      status: expenses.status,
      payerName: participants.displayName,
    })
    .from(expenses)
    .innerJoin(participants, eq(participants.id, expenses.payerParticipantId))
    .where(eq(expenses.groupId, groupId))
    .orderBy(desc(expenses.occurredOn), desc(expenses.createdAt))
    .limit(limit);
}
