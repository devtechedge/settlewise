import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageAuth } from "@/auth/page-auth";
import { getMembership } from "@/auth/rbac";
import { getParticipantBalances } from "@/repositories/ledger";
import { listPayments } from "@/repositories/payments";
import { formatMinor } from "@/domain/money/money";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { Money } from "@/components/money";
import { PaymentForm } from "@/components/payment-form";
import { ReversePaymentForm } from "@/components/reverse-payment-form";

export const metadata: Metadata = { title: "Settlements", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SettlementsPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const auth = await requirePageAuth(`/groups/${groupId}/settlements`);
  const membership = await getMembership(groupId, auth.user.id);
  if (!membership) notFound();

  const [data, payments] = await Promise.all([getParticipantBalances(groupId), listPayments(groupId, 1, 50)]);
  const names = new Map(data.balances.map((row) => [row.participantId, row.displayName]));
  const viewerParticipant = data.balances.find((row) => row.userId === auth.user.id);
  const isMember = membership.role === "MEMBER";
  const canReverseAny = membership.role === "OWNER";
  const debtors = data.balances
    .filter((row) => row.netMinor < 0n)
    .map((row) => ({ id: row.participantId, name: row.displayName, netMinor: row.netMinor }));
  const creditors = data.balances
    .filter((row) => row.netMinor > 0n)
    .map((row) => ({ id: row.participantId, name: row.displayName, netMinor: row.netMinor }));
  const suggestions = data.plan.transfers.map((transfer) => ({
    fromId: transfer.fromParticipantId,
    toId: transfer.toParticipantId,
    amountMinor: transfer.amountMinor,
    fromName: names.get(transfer.fromParticipantId) ?? "Unknown",
    toName: names.get(transfer.toParticipantId) ?? "Unknown",
  }));

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow="Reimbursement planning"
        title="Settlements"
        description="A deterministic plan suggests who could pay whom. Recording a payment here records something that already happened outside Settlewise. No funds move through this application."
      />

      <div className="grid-2">
        <section className="card">
          <div className="card-header">
            <h2>Suggested settlement plan</h2>
            <Badge variant={data.plan.isSettled ? "active" : "duplicate"}>{data.plan.isSettled ? "settled" : "open"}</Badge>
          </div>
          <div className="card-body stack">
            {data.plan.isSettled ? (
              <div className="notice">
                <strong>All clear.</strong> Net balances are zero after active expenses and recorded payments.
              </div>
            ) : (
              <div className="settlement-flow">
                {data.plan.transfers.map((transfer) => (
                  <div
                    className="settlement-transfer"
                    key={`${transfer.fromParticipantId}-${transfer.toParticipantId}-${transfer.amountMinor}`}
                  >
                    <div className="party">
                      {names.get(transfer.fromParticipantId)}
                      <small>owes this much now</small>
                    </div>
                    <div className="arrow" aria-hidden="true">→</div>
                    <div className="party">
                      {names.get(transfer.toParticipantId)}
                      <small>is owed this much now</small>
                    </div>
                    <div className="amt">{formatMinor(transfer.amountMinor, membership.currency)}</div>
                    <div className="settlement-basis">
                      Based on a net position of {formatMinor(transfer.fromBalanceBefore, membership.currency)} for the sender
                      and {formatMinor(transfer.toBalanceBefore, membership.currency)} for the recipient before this transfer.
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="split-preview">
              <div className="head">
                <span>Reconciliation</span>
                <span>{formatMinor(data.plan.totalMinor, membership.currency)} total transfers</span>
              </div>
              <div className="preview-row">
                <span>Sum of debtor balances</span>
                <span>{formatMinor(data.plan.debtorTotalMinor, membership.currency)}</span>
              </div>
              <div className="preview-row">
                <span>Sum of creditor balances</span>
                <span>{formatMinor(data.plan.creditorTotalMinor, membership.currency)}</span>
              </div>
              <p className="rule-note">{data.plan.algorithmNote}</p>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2>Record a reimbursement</h2>
          </div>
          <div className="card-body">
            <PaymentForm
              groupId={groupId}
              currency={membership.currency}
              debtors={debtors}
              creditors={creditors}
              suggestions={suggestions}
              memberParticipantId={viewerParticipant?.participantId ?? null}
              isMember={isMember}
            />
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-header">
          <h2>Payment history</h2>
          <span className="small muted">including reversals</span>
        </div>
        <div className="card-body">
          {payments.rows.length === 0 ? (
            <EmptyState title="No reimbursements recorded">
              Payments appear here after someone records a reimbursement that already happened outside the app.
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="ledger">
                <caption className="visually-hidden">Recorded reimbursements and their reversal records.</caption>
                <thead>
                  <tr>
                    <th scope="col">Recorded</th>
                    <th scope="col">From → to</th>
                    <th scope="col">Paid on</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="num">Amount</th>
                    <th scope="col">Recorded by</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.rows.map((payment) => {
                    const canReverse =
                      payment.status === "RECORDED" &&
                      !payment.reversalOfPaymentId &&
                      (canReverseAny || payment.createdById === auth.user.id);
                    return (
                      <tr key={payment.id}>
                        <td className="small mono">{payment.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                        <td>
                          {payment.senderName} → {payment.recipientName}
                          {payment.reversalOfPaymentId ? (
                            <span className="small muted"> · reversal record</span>
                          ) : null}
                          {payment.notes ? <span className="small muted"> · {payment.notes}</span> : null}
                        </td>
                        <td className="small mono">{payment.paidOn}</td>
                        <td><Badge variant={payment.status === "RECORDED" ? "active" : "reversed"}>{payment.status.toLowerCase()}</Badge></td>
                        <td className="num"><Money minor={payment.amountMinor} currency={payment.currency} /></td>
                        <td className="small">{payment.createdByName}</td>
                        <td>
                          {canReverse ? (
                            <ReversePaymentForm
                              paymentId={payment.id}
                              label={`${payment.senderName} to ${payment.recipientName}, ${formatMinor(payment.amountMinor, payment.currency)}`}
                            />
                          ) : payment.reversalReason ? (
                            <span className="small muted">Reason: {payment.reversalReason}</span>
                          ) : (
                            <span className="small muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="small muted" style={{ marginTop: "0.8rem" }}>
            A payment reduces the sender&apos;s debt and the recipient&apos;s credit by the same amount. Reversing it
            creates a linked compensating record and excludes both from effective balances, without deleting history.
          </p>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Net positions</h2>
        </div>
        <div className="card-body">
          <div className="table-wrap">
            <table className="ledger">
              <thead>
                <tr>
                  <th scope="col">Participant</th>
                  <th scope="col" className="num">Net balance</th>
                </tr>
              </thead>
              <tbody>
                {data.balances.map((row) => (
                  <tr key={row.participantId}>
                    <td>{row.displayName}</td>
                    <td className="num"><Money minor={row.netMinor} currency={membership.currency} signed note /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
