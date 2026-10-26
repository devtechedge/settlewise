import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageAuth } from "@/auth/page-auth";
import { getMembership } from "@/auth/rbac";
import { getExpenseDetail } from "@/repositories/expenses";
import { listParticipants } from "@/repositories/groups";
import { getCurrency } from "@/domain/money/currency";
import { minorToPlainString } from "@/domain/money/money";
import { ExpenseForm, type ExpenseInitial } from "@/components/expense-form";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Correct expense", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function EditExpensePage({ params }: { params: Promise<{ groupId: string; expenseId: string }> }) {
  const { groupId, expenseId } = await params;
  const auth = await requirePageAuth(`/groups/${groupId}/expenses/${expenseId}/edit`);
  const membership = await getMembership(groupId, auth.user.id);
  if (!membership) notFound();
  if (membership.role === "MEMBER") {
    return (
      <div className="card">
        <div className="card-body stack">
          <p className="eyebrow">Authorization denied</p>
          <h2>Corrections require the editor role</h2>
          <Link href={`/groups/${groupId}/expenses/${expenseId}`} className="button">Back to expense</Link>
        </div>
      </div>
    );
  }

  const detail = await getExpenseDetail(groupId, expenseId);
  if (!detail) notFound();
  if (detail.expense.status === "VOID") {
    return (
      <div className="card">
        <div className="card-body stack">
          <p className="eyebrow">Voided record</p>
          <h2>This expense cannot be edited</h2>
          <p className="muted">Voided expenses stay in history but are excluded from balances. Record a new expense instead.</p>
          <Link href={`/groups/${groupId}/expenses/${expenseId}`} className="button">View history</Link>
        </div>
      </div>
    );
  }

  const participants = await listParticipants(groupId);

  if (membership.groupStatus === "ARCHIVED") {
    return (
      <div className="card">
        <div className="card-body stack">
          <p className="eyebrow">Archived group</p>
          <h2>This ledger is read-only</h2>
          <p className="muted">Restore the group from the participants page before correcting an expense.</p>
          <Link href={`/groups/${groupId}/expenses/${expenseId}`} className="button">View history</Link>
        </div>
      </div>
    );
  }
  const currency = getCurrency(detail.expense.currency);
  const method = detail.splits[0]?.method ?? "EQUAL";
  const initial: ExpenseInitial = {
    description: detail.expense.description,
    amount: minorToPlainString(detail.expense.amountMinor, currency),
    category: detail.expense.category,
    occurredOn: detail.expense.occurredOn,
    payerParticipantId: detail.expense.payerParticipantId,
    notes: detail.expense.notes ?? "",
    method,
    revision: detail.expense.revision,
    entries: detail.splits.map((split) => ({
      id: split.participantId,
      amount: minorToPlainString(split.allocatedMinor, currency),
      percent: split.basisPoints !== null ? (split.basisPoints / 100).toFixed(2) : "0.00",
      shares: split.shares !== null ? String(split.shares) : "1",
    })),
  };

  return (
    <div>
      <PageHeader
        eyebrow={`Revision ${detail.expense.revision}`}
        title="Correct this expense"
        description="Saving writes a new revision with a before-and-after snapshot. The old version is not overwritten in history, and a stale revision is rejected."
        actions={<Link href={`/groups/${groupId}/expenses/${expenseId}`} className="button secondary">Cancel</Link>}
      />
      <ExpenseForm
        groupId={groupId}
        currency={detail.expense.currency}
        participants={participants.map((participant) => ({
          id: participant.id,
          displayName: participant.displayName,
          status: participant.status,
        }))}
        mode="edit"
        expenseId={expenseId}
        initial={initial}
        defaultPayerId={detail.expense.payerParticipantId}
      />
    </div>
  );
}
