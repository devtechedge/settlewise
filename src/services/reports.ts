import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  budgets,
  expenses,
  expenseSplits,
  exportRecords,
  groups,
  participants,
  settlementPayments,
} from "@/db/schema";
import { CATEGORY_LABELS, type ExpenseCategory } from "@/domain/money/currency";
import { requireGroupRole } from "@/auth/rbac";
import { getParticipantBalances } from "@/repositories/ledger";

export type ReportRange = { from: string; to: string };

export function defaultReportRange(): ReportRange {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  return { from: start.toISOString().slice(0, 10), to: end };
}

export function currentMonthRange(): ReportRange {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const today = now.toISOString().slice(0, 10);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10) > today ? today : end.toISOString().slice(0, 10),
  };
}

export async function getReports(groupId: string, userId: string, range: ReportRange) {
  const membership = await requireGroupRole(groupId, userId, "MEMBER");
  const [groupRow] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!groupRow) return null;
  const periodFilter = and(
    eq(expenses.groupId, groupId),
    eq(expenses.status, "ACTIVE"),
    gte(expenses.occurredOn, range.from),
    lte(expenses.occurredOn, range.to),
  );

  const [totalRow] = await db
    .select({ total: sql<string>`coalesce(sum(${expenses.amountMinor})::text, '0')`, count: sql<number>`count(*)::int` })
    .from(expenses)
    .where(periodFilter);

  const byCategory = await db
    .select({
      category: expenses.category,
      total: sql<string>`sum(${expenses.amountMinor})::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(expenses)
    .where(periodFilter)
    .groupBy(expenses.category)
    .orderBy(desc(sql`sum(${expenses.amountMinor})`));

  const byMonth = await db
    .select({
      month: sql<string>`to_char(${expenses.occurredOn}, 'YYYY-MM')`,
      total: sql<string>`sum(${expenses.amountMinor})::text`,
    })
    .from(expenses)
    .where(periodFilter)
    .groupBy(sql`to_char(${expenses.occurredOn}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${expenses.occurredOn}, 'YYYY-MM')`);

  const paidByParticipant = await db
    .select({
      participantId: expenses.payerParticipantId,
      paid: sql<string>`sum(${expenses.amountMinor})::text`,
    })
    .from(expenses)
    .where(periodFilter)
    .groupBy(expenses.payerParticipantId);

  const owedByParticipant = await db
    .select({
      participantId: expenseSplits.participantId,
      owed: sql<string>`sum(${expenseSplits.allocatedMinor})::text`,
    })
    .from(expenseSplits)
    .innerJoin(expenses, eq(expenses.id, expenseSplits.expenseId))
    .where(periodFilter)
    .groupBy(expenseSplits.participantId);

  const participantRows = await db
    .select({ id: participants.id, displayName: participants.displayName })
    .from(participants)
    .where(eq(participants.groupId, groupId));
  const paidMap = new Map(paidByParticipant.map((row) => [row.participantId, BigInt(row.paid)]));
  const owedMap = new Map(owedByParticipant.map((row) => [row.participantId, BigInt(row.owed)]));
  const contributionRows = participantRows
    .map((row) => ({
      participantId: row.id,
      displayName: row.displayName,
      paidMinor: (paidMap.get(row.id) ?? 0n).toString(),
      owedMinor: (owedMap.get(row.id) ?? 0n).toString(),
    }))
    .sort((a, b) => {
      const diff = BigInt(b.paidMinor) - BigInt(a.paidMinor);
      return diff > 0n ? 1 : diff < 0n ? -1 : a.displayName.localeCompare(b.displayName);
    });

  const [paymentTotal] = await db
    .select({
      total: sql<string>`coalesce(sum(${settlementPayments.amountMinor})::text, '0')`,
      count: sql<number>`count(*)::int`,
    })
    .from(settlementPayments)
    .where(
      and(
        eq(settlementPayments.groupId, groupId),
        eq(settlementPayments.status, "RECORDED"),
        gte(settlementPayments.paidOn, range.from),
        lte(settlementPayments.paidOn, range.to),
      ),
    );

  const monthRange = currentMonthRange();
  const [currentMonth] = await db
    .select({ total: sql<string>`coalesce(sum(${expenses.amountMinor})::text, '0')` })
    .from(expenses)
    .where(
      and(
        eq(expenses.groupId, groupId),
        eq(expenses.status, "ACTIVE"),
        gte(expenses.occurredOn, monthRange.from),
        lte(expenses.occurredOn, monthRange.to),
      ),
    );

  const categoryBudgetRows = await db.select().from(budgets).where(eq(budgets.groupId, groupId));
  const categorySpendMonth = await db
    .select({ category: expenses.category, total: sql<string>`sum(${expenses.amountMinor})::text` })
    .from(expenses)
    .where(
      and(
        eq(expenses.groupId, groupId),
        eq(expenses.status, "ACTIVE"),
        gte(expenses.occurredOn, monthRange.from),
        lte(expenses.occurredOn, monthRange.to),
      ),
    )
    .groupBy(expenses.category);
  const categorySpendAllTime = await db
    .select({ category: expenses.category, total: sql<string>`sum(${expenses.amountMinor})::text` })
    .from(expenses)
    .where(and(eq(expenses.groupId, groupId), eq(expenses.status, "ACTIVE")))
    .groupBy(expenses.category);
  const monthCategoryMap = new Map(categorySpendMonth.map((row) => [row.category, BigInt(row.total)]));
  const allCategoryMap = new Map(categorySpendAllTime.map((row) => [row.category, BigInt(row.total)]));

  const budgetRows = [
    ...(groupRow.budgetMinor !== null
      ? [
          {
            id: "group-budget",
            label: "Overall monthly budget",
            limitMinor: groupRow.budgetMinor.toString(),
            spentMinor: BigInt(currentMonth?.total ?? "0").toString(),
            period: "MONTHLY" as const,
            scope: "OVERALL" as const,
          },
        ]
      : []),
    ...categoryBudgetRows.map((budget) => {
      const spendMap = budget.period === "MONTHLY" ? monthCategoryMap : allCategoryMap;
      return {
        id: budget.id,
        label: `${CATEGORY_LABELS[budget.category as ExpenseCategory] ?? budget.category} budget`,
        limitMinor: budget.limitMinor.toString(),
        spentMinor: (spendMap.get(budget.category) ?? 0n).toString(),
        period: budget.period,
        scope: "CATEGORY" as const,
      };
    }),
  ];

  const balanceData = await getParticipantBalances(groupId);
  const recentExports = await db
    .select({
      id: exportRecords.id,
      format: exportRecords.format,
      rowCount: exportRecords.rowCount,
      filters: exportRecords.filters,
      createdAt: exportRecords.createdAt,
    })
    .from(exportRecords)
    .where(eq(exportRecords.groupId, groupId))
    .orderBy(desc(exportRecords.createdAt))
    .limit(5);

  return {
    membership,
    group: groupRow,
    range,
    totalMinor: BigInt(totalRow?.total ?? "0"),
    expenseCount: totalRow?.count ?? 0,
    byCategory: byCategory.map((row) => ({
      category: row.category,
      label: CATEGORY_LABELS[row.category as ExpenseCategory] ?? row.category,
      totalMinor: BigInt(row.total),
      count: row.count,
    })),
    byMonth: byMonth.map((row) => ({ month: row.month, totalMinor: BigInt(row.total) })),
    contributions: contributionRows,
    payments: { totalMinor: BigInt(paymentTotal?.total ?? "0"), count: paymentTotal?.count ?? 0 },
    budgets: budgetRows,
    balances: balanceData.balances,
    recentExports,
  };
}

