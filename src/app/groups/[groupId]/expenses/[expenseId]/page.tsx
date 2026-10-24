import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageAuth } from "@/auth/page-auth";
import { getMembership } from "@/auth/rbac";
import { getExpenseDetail } from "@/repositories/expenses";
import { CATEGORY_LABELS } from "@/domain/money/currency";
import { formatPercentFromBasisPoints } from "@/domain/money/labels";
import { Badge } from "@/components/ui";
import { Money } from "@/components/money";
import { VoidExpenseForm } from "@/components/void-expense-form";

export const metadata: Metadata = { title: "Expense", robots: { index: false } };
export const dynamic = "force-dynamic";

const METHOD_RULES: Record<string, string> = {
  EQUAL: "Equal split. Residual minor units go to the first beneficiaries by participant ID.",
  EXACT: "Exact amounts entered per beneficiary. The shares must sum to the expense total.",
  PERCENT: "Percentage split stored as integer basis points. Largest remainder assigns residual minor units.",
  SHARES: "Weighted shares. Each share is total times weight divided by total weight with largest-remainder rounding.",
};

export default async function ExpenseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string; expenseId: string }>;
  searchParams: Promise<{ created?: string; updated?: string }>;
}) {
  const { groupId, expenseId } = await params;
  const notices = await searchParams;
  const auth = await requirePageAuth(`/groups/${groupId}/expenses/${expenseId}`);
  const membership = await getMembership(groupId, auth.user.id);
  if (!membership) notFound();
  const detail = await getExpenseDetail(groupId, expenseId);
  if (!detail) notFound();

  const canEdit = membership.role === "OWNER" || membership.role === "EDITOR";
  const { expense, splits, revisions } = detail;
  const splitTotal = splits.reduce((acc, split) => acc + split.allocatedMinor, 0n);
  const method = splits[0]?.method ?? "EQUAL";

  return (
    <div className="stack-lg">
      {notices.created ? <div className="alert success" role="status">Expense recorded. Balances and the settlement plan have been recalculated.</div> : null}
      {notices.updated ? <div className="alert success" role="status">Correction saved as a new revision. The previous version remains in history.</div> : null}
      {expense.status === "VOID" ? (
        <div className="alert" role="alert">
          <strong>This expense is void.</strong> {expense.voidReason ? `Reason: ${expense.voidReason}.` : ""} It is excluded from balances and settlement plans but kept in the audit history.
        </div>
      ) : null}

      <div className="page-head" style={{ marginBottom: "0" }}>
        <div>
          <p className="eyebrow">
            {expense.occurredOn} · {CATEGORY_LABELS[expense.category as keyof typeof CATEGORY_LABELS] ?? expense.category}
          </p>
          <h2 style={{ fontSize: "clamp(2rem, 3.5vw, 3rem)", marginBottom: "0.4rem" }}>{expense.description}</h2>
          <div className="group-meta">
            <Badge variant={expense.status === "VOID" ? "void" : "active"}>{expense.status.toLowerCase()}</Badge>
            <span>Revision {expense.revision}</span>
            <span aria-hidden="true">·</span>
            <span>Paid by {expense.payerName}</span>
          </div>
        </div>
        <div className="page-actions">
          <Link href={`/groups/${groupId}/expenses`} className="button ghost">Back</Link>
          {canEdit && expense.status === "ACTIVE" ? (
            <>
              <Link href={`/groups/${groupId}/expenses/${expenseId}/edit`} className="button secondary">Correct</Link>
              <VoidExpenseForm expenseId={expenseId} revision={expense.revision} />
            </>
          ) : null}
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-header">
            <h3>Allocation</h3>
            <span className="small muted">{METHOD_RULES[method]}</span>
          </div>
          <div className="card-body">
            <div className="table-wrap">
              <table className="ledger">
                <caption className="visually-hidden">How the expense amount is allocated among participants.</caption>
                <thead>
                  <tr>
                    <th scope="col">Beneficiary</th>
                    <th scope="col">Rule</th>
                    <th scope="col" className="num">Allocated</th>
                  </tr>
                </thead>
                <tbody>
                  {splits.map((split) => (
                    <tr key={split.participantId}>
                      <td className="name">{split.displayName}</td>
                      <td className="small">
                        {split.method === "PERCENT" && split.basisPoints !== null
                          ? formatPercentFromBasisPoints(split.basisPoints)
                          : split.method === "SHARES" && split.shares !== null
                            ? `${split.shares} share${split.shares === 1 ? "" : "s"}`
                            : split.method === "EXACT"
                              ? "exact amount"
                              : "equal share"}
                      </td>
                      <td className="num"><Money minor={split.allocatedMinor} currency={expense.currency} /></td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={2}><strong>Allocated total</strong></td>
                    <td className="num">
                      <Money minor={splitTotal} currency={expense.currency} />
                      {splitTotal !== expense.amountMinor ? <span className="field-error"> mismatch</span> : null}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h3>Record</h3>
          </div>
          <div className="card-body">
            <dl className="detail-list">
              <div className="detail-row">
                <dt>Amount</dt>
                <dd><Money minor={expense.amountMinor} currency={expense.currency} /></dd>
              </div>
              <div className="detail-row">
                <dt>Currency</dt>
                <dd className="mono">{expense.currency}</dd>
              </div>
              <div className="detail-row">
                <dt>Paid by</dt>
                <dd>{expense.payerName}</dd>
              </div>
              <div className="detail-row">
                <dt>Occurred on</dt>
                <dd className="mono">{expense.occurredOn}</dd>
              </div>
              <div className="detail-row">
                <dt>Recorded by</dt>
                <dd>{expense.createdByName}</dd>
              </div>
              <div className="detail-row">
                <dt>Last updated</dt>
                <dd className="mono small">{expense.updatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC</dd>
              </div>
            </dl>
            {expense.notes ? (
              <div className="notice" style={{ marginTop: "1rem" }}>
                <strong>Notes:</strong> {expense.notes}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-header">
          <h3>Revision history</h3>
          <span className="small muted">immutable snapshots</span>
        </div>
        <div className="card-body">
          <div className="revision-list">
            {revisions.map((revision) => (
              <details className="revision-item" key={revision.id}>
                <summary>
                  <strong>Revision {revision.revision} · {revision.action.toLowerCase()}</strong>
                  <span>
                    {revision.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC · {revision.actorName ?? "System"}
                  </span>
                </summary>
                {revision.reason ? <p className="small" style={{ margin: "0.5rem 0 0" }}>Reason: {revision.reason}</p> : null}
                <div className="snapshot">
                  <div>
                    <h4>Before</h4>
                    <pre>{revision.beforeSnapshot ? JSON.stringify(revision.beforeSnapshot, null, 2) : "No prior state"}</pre>
                  </div>
                  <div>
                    <h4>After</h4>
                    <pre>{revision.afterSnapshot ? JSON.stringify(revision.afterSnapshot, null, 2) : "No state recorded"}</pre>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
