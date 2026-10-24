import { AppError } from "@/lib/errors";

export type LedgerExpense = {
  payerParticipantId: string;
  amountMinor: bigint;
  splits: { participantId: string; allocatedMinor: bigint }[];
};

export type LedgerPayment = {
  senderParticipantId: string;
  recipientParticipantId: string;
  amountMinor: bigint;
};

export type NetBalance = {
  participantId: string;
  netMinor: bigint;
};

export type SettlementTransfer = {
  fromParticipantId: string;
  toParticipantId: string;
  amountMinor: bigint;
  fromBalanceBefore: bigint;
  toBalanceBefore: bigint;
};

export type SettlementPlan = {
  balances: NetBalance[];
  transfers: SettlementTransfer[];
  totalMinor: bigint;
  debtorTotalMinor: bigint;
  creditorTotalMinor: bigint;
  isSettled: boolean;
  algorithmNote: string;
};

export const SETTLEMENT_ALGORITHM_NOTE =
  "Greedy largest-debt to largest-credit matching. It consolidates transfers compared with listing every expense, but it does not claim a globally minimum number of transfers for every ledger.";

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function computeNetBalances(input: {
  expenses: LedgerExpense[];
  payments?: LedgerPayment[];
  participantIds?: string[];
}): NetBalance[] {
  const balances = new Map<string, bigint>();
  const ensure = (id: string) => {
    if (!balances.has(id)) balances.set(id, 0n);
    return balances.get(id) as bigint;
  };

  for (const participantId of input.participantIds ?? []) ensure(participantId);

  for (const expense of input.expenses) {
    if (expense.amountMinor <= 0n) {
      throw new AppError("BALANCE_INVARIANT", "Ledger contains a non-positive expense amount.");
    }
    if (expense.splits.length === 0) {
      throw new AppError("BALANCE_INVARIANT", "Ledger contains an expense without splits.");
    }
    let splitTotal = 0n;
    for (const split of expense.splits) {
      if (split.allocatedMinor < 0n) {
        throw new AppError("BALANCE_INVARIANT", "Ledger contains a negative split.");
      }
      if (!balances.has(split.participantId)) {
        balances.set(split.participantId, 0n);
      }
      balances.set(split.participantId, (balances.get(split.participantId) as bigint) - split.allocatedMinor);
      splitTotal += split.allocatedMinor;
    }
    if (splitTotal !== expense.amountMinor) {
      throw new AppError("BALANCE_INVARIANT", "An expense's splits do not sum to its amount.", {
        expenseAmount: expense.amountMinor.toString(),
        splitTotal: splitTotal.toString(),
      });
    }
    balances.set(expense.payerParticipantId, (balances.get(expense.payerParticipantId) ?? 0n) + expense.amountMinor);
  }

  for (const payment of input.payments ?? []) {
    if (payment.amountMinor <= 0n) {
      throw new AppError("BALANCE_INVARIANT", "Ledger contains a non-positive payment amount.");
    }
    if (payment.senderParticipantId === payment.recipientParticipantId) {
      throw new AppError("BALANCE_INVARIANT", "A settlement payment cannot be between the same participant.");
    }
    balances.set(payment.senderParticipantId, (balances.get(payment.senderParticipantId) ?? 0n) + payment.amountMinor);
    balances.set(payment.recipientParticipantId, (balances.get(payment.recipientParticipantId) ?? 0n) - payment.amountMinor);
  }

  const rows = [...balances.entries()]
    .map(([participantId, netMinor]) => ({ participantId, netMinor }))
    .sort((a, b) => compareIds(a.participantId, b.participantId));

  const sum = rows.reduce((acc, row) => acc + row.netMinor, 0n);
  if (sum !== 0n) {
    throw new AppError("BALANCE_INVARIANT", "Participant net balances do not sum to zero.", {
      sum: sum.toString(),
    });
  }
  return rows;
}

export function generateSettlementPlan(balances: NetBalance[]): SettlementPlan {
  const sum = balances.reduce((acc, row) => acc + row.netMinor, 0n);
  if (sum !== 0n) {
    throw new AppError("BALANCE_INVARIANT", "Cannot plan a settlement for balances that do not sum to zero.");
  }

  const debtors = balances
    .filter((row) => row.netMinor < 0n)
    .map((row) => ({ participantId: row.participantId, remaining: -row.netMinor }))
    .sort((a, b) => {
      if (a.remaining === b.remaining) return compareIds(a.participantId, b.participantId);
      return a.remaining > b.remaining ? -1 : 1;
    });
  const creditors = balances
    .filter((row) => row.netMinor > 0n)
    .map((row) => ({ participantId: row.participantId, remaining: row.netMinor }))
    .sort((a, b) => {
      if (a.remaining === b.remaining) return compareIds(a.participantId, b.participantId);
      return a.remaining > b.remaining ? -1 : 1;
    });

  const debtorTotal = debtors.reduce((acc, row) => acc + row.remaining, 0n);
  const creditorTotal = creditors.reduce((acc, row) => acc + row.remaining, 0n);
  if (debtorTotal !== creditorTotal) {
    throw new AppError("BALANCE_INVARIANT", "Debtor and creditor totals do not match.");
  }

  const transfers: SettlementTransfer[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    if (!debtor || !creditor) break;
    const amount = debtor.remaining < creditor.remaining ? debtor.remaining : creditor.remaining;
    if (amount > 0n) {
      transfers.push({
        fromParticipantId: debtor.participantId,
        toParticipantId: creditor.participantId,
        amountMinor: amount,
        fromBalanceBefore: -debtor.remaining,
        toBalanceBefore: creditor.remaining,
      });
    }
    debtor.remaining -= amount;
    creditor.remaining -= amount;
    if (debtor.remaining === 0n) debtorIndex += 1;
    if (creditor.remaining === 0n) creditorIndex += 1;
  }

  const transferTotal = transfers.reduce((acc, row) => acc + row.amountMinor, 0n);
  if (transferTotal !== debtorTotal) {
    throw new AppError("BALANCE_INVARIANT", "Settlement transfers do not reconcile with outstanding balances.");
  }

  return {
    balances,
    transfers,
    totalMinor: transferTotal,
    debtorTotalMinor: debtorTotal,
    creditorTotalMinor: creditorTotal,
    isSettled: debtorTotal === 0n,
    algorithmNote: SETTLEMENT_ALGORITHM_NOTE,
  };
}

export function computeSettlementPlan(input: {
  expenses: LedgerExpense[];
  payments?: LedgerPayment[];
  participantIds?: string[];
}): SettlementPlan {
  return generateSettlementPlan(computeNetBalances(input));
}
