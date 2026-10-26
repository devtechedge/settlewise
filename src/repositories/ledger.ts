import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, expenses, expenseSplits, participants, settlementPayments, users } from "@/db/schema";
import { computeNetBalances, generateSettlementPlan, type LedgerExpense, type LedgerPayment } from "@/domain/settlement/settlement";

type Reader = Pick<typeof db, "select">;

export type LedgerData = {
  expenses: LedgerExpense[];
  payments: LedgerPayment[];
};

export async function loadLedger(
  executor: Reader,
  groupId: string,
  range?: { from?: string; to?: string },
): Promise<LedgerData> {
  const conditions = [eq(expenses.groupId, groupId), eq(expenses.status, "ACTIVE")];
  if (range?.from) conditions.push(gte(expenses.occurredOn, range.from));
  if (range?.to) conditions.push(lte(expenses.occurredOn, range.to));
  const expenseRows = await executor
    .select({
      id: expenses.id,
      payerParticipantId: expenses.payerParticipantId,
      amountMinor: expenses.amountMinor,
    })
    .from(expenses)
    .where(and(...conditions))
    .orderBy(asc(expenses.occurredOn), asc(expenses.createdAt));

  const ids = expenseRows.map((row) => row.id);
  const splitRows =
    ids.length > 0
      ? await executor
          .select({
            expenseId: expenseSplits.expenseId,
            participantId: expenseSplits.participantId,
            allocatedMinor: expenseSplits.allocatedMinor,
          })
          .from(expenseSplits)
          .where(inArray(expenseSplits.expenseId, ids))
      : [];

  const splitsByExpense = new Map<string, { participantId: string; allocatedMinor: bigint }[]>();
  for (const split of splitRows) {
    const list = splitsByExpense.get(split.expenseId) ?? [];
    list.push({ participantId: split.participantId, allocatedMinor: split.allocatedMinor });
    splitsByExpense.set(split.expenseId, list);
  }

  const paymentConditions = [eq(settlementPayments.groupId, groupId), eq(settlementPayments.status, "RECORDED")];
  if (range?.from) paymentConditions.push(gte(settlementPayments.paidOn, range.from));
  if (range?.to) paymentConditions.push(lte(settlementPayments.paidOn, range.to));
  const paymentRows = await executor
    .select({
      senderParticipantId: settlementPayments.senderParticipantId,
      recipientParticipantId: settlementPayments.recipientParticipantId,
      amountMinor: settlementPayments.amountMinor,
    })
    .from(settlementPayments)
    .where(and(...paymentConditions));

  return {
    expenses: expenseRows.map((row) => ({
      payerParticipantId: row.payerParticipantId,
      amountMinor: row.amountMinor,
      splits: splitsByExpense.get(row.id) ?? [],
    })),
    payments: paymentRows,
  };
}

export async function getParticipantBalances(groupId: string, executor: Reader = db) {
  const participantRows = await executor
    .select({
      id: participants.id,
      displayName: participants.displayName,
      status: participants.status,
      userId: participants.userId,
    })
    .from(participants)
    .where(eq(participants.groupId, groupId))
    .orderBy(asc(participants.displayName));
  const ledger = await loadLedger(executor, groupId);
  const balances = computeNetBalances({
    expenses: ledger.expenses,
    payments: ledger.payments,
    participantIds: participantRows.map((row) => row.id),
  });
  const byId = new Map(participantRows.map((row) => [row.id, row]));
  const withNames = balances.map((balance) => ({
    ...balance,
    displayName: byId.get(balance.participantId)?.displayName ?? "Unknown participant",
    status: byId.get(balance.participantId)?.status ?? "INACTIVE",
    userId: byId.get(balance.participantId)?.userId ?? null,
  }));
  const plan = generateSettlementPlan(
    withNames.map((row) => ({ participantId: row.participantId, netMinor: row.netMinor })),
  );
  return { balances: withNames, plan, participants: participantRows };
}


export async function listRecentAuditEvents(groupId: string, limit = 6) {
  return db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      targetType: auditEvents.targetType,
      targetId: auditEvents.targetId,
      reason: auditEvents.reason,
      createdAt: auditEvents.createdAt,
      actorName: users.displayName,
    })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorId))
    .where(eq(auditEvents.groupId, groupId))
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);
}

