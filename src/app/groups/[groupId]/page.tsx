import type { Metadata } from "next";
import Link from "next/link";
import { requirePageAuth } from "@/auth/page-auth";
import { getGroupOverview } from "@/services/groups";
import { formatMinor } from "@/domain/money/money";
import { CATEGORY_LABELS, type ExpenseCategory } from "@/domain/money/currency";
import { Badge, EmptyState, Stat } from "@/components/ui";
import { Money } from "@/components/money";

export const metadata: Metadata = { title: "Group overview", robots: { index: false } };
export const dynamic = "force-dynamic";

function actionLabel(action: string) {
  return action
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function GroupOverviewPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const auth = await requirePageAuth(`/groups/${groupId}`);
  const data = await getGroupOverview(groupId, auth.user.id);
  const names = new Map(data.balances.map((row) => [row.participantId, row.displayName]));
  const canManage = data.membership.role === "OWNER" || data.membership.role === "EDITOR";
  const activeCount = data.allParticipants.filter((participant) => participant.status === "ACTIVE").length;
  const topTransfers = data.plan.transfers.slice(0, 4);

  return (
    <div className="stack-lg">
      <div className="grid-4">
        <Stat
          label="Recorded spending"
          value={<Money minor={data.totals.totalMinor} currency={data.group.currency} />}
          note={`${data.totals.activeCount} active expense${data.totals.activeCount === 1 ? "" : "s"}`}
        />
        <Stat
          label="Open obligations"
          value={<Money minor={data.plan.debtorTotalMinor} currency={data.group.currency} />}
          note={data.plan.isSettled ? "Everyone is square" : `${data.plan.transfers.length} suggested transfer${data.plan.transfers.length === 1 ? "" : "s"}`}
        />
        <Stat label="Participants" value={activeCount} note={`${data.balances.length} with ledger history`} />
        <Stat
          label="Monthly budget"
          value={data.group.budgetMinor !== null ? <Money minor={data.group.budgetMinor} currency={data.group.currency} /> : "Not set"}
          note={data.group.budgetMinor !== null ? "Consumption is in Reports" : "Optional"}
        />
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-header">
            <h2>Current balances</h2>
            <span className="small muted">signed from recorded activity</span>
          </div>
          <div className="card-body">
            {data.balances.length === 0 ? (
              <EmptyState title="No participants yet">Add the people who share this ledger.</EmptyState>
            ) : (
              <div className="table-wrap">
                <table className="ledger balance-table">
                  <caption className="visually-hidden">Signed participant balances. Negative means the participant owes the group; positive means the group owes them.</caption>
                  <thead>
                    <tr>
                      <th scope="col">Participant</th>
                      <th scope="col">Status</th>
                      <th scope="col" className="num">Net balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.balances.map((row) => (
                      <tr key={row.participantId}>
                        <td className="name">{row.displayName}</td>
                        <td>
                          <Badge variant={row.status === "ACTIVE" ? "active" : "inactive"}>{row.status.toLowerCase()}</Badge>
                        </td>
                        <td className="num">
                          <Money minor={row.netMinor} currency={data.group.currency} signed note />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2>Next settlement actions</h2>
            <Link href={`/groups/${groupId}/settlements`} className="small">Full plan</Link>
          </div>
          <div className="card-body stack">
            {data.plan.isSettled ? (
              <div className="notice">
                <strong>Nothing outstanding.</strong> Every active participant has a zero net balance from recorded
                expenses and payments.
              </div>
            ) : (
              <div className="settlement-flow">
                {topTransfers.map((transfer) => (
                  <div className="settlement-transfer" key={`${transfer.fromParticipantId}-${transfer.toParticipantId}-${transfer.amountMinor}`}>
                    <div className="party">
                      {names.get(transfer.fromParticipantId)}
                      <small>owes</small>
                    </div>
                    <div className="arrow" aria-hidden="true">→</div>
                    <div className="party">
                      {names.get(transfer.toParticipantId)}
                      <small>is owed</small>
                    </div>
                    <div className="amt">{formatMinor(transfer.amountMinor, data.group.currency)}</div>
                  </div>
                ))}
                {data.plan.transfers.length > topTransfers.length ? (
                  <p className="small muted">Plus {data.plan.transfers.length - topTransfers.length} more suggested transfer{data.plan.transfers.length - topTransfers.length === 1 ? "" : "s"}.</p>
                ) : null}
              </div>
            )}
            <p className="small muted">{data.plan.algorithmNote} This is a suggestion, not a payment.</p>
          </div>
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-header">
            <h2>Recent ledger entries</h2>
            <Link href={`/groups/${groupId}/expenses`} className="small">All expenses</Link>
          </div>
          <div className="card-body">
            {data.recentExpenses.length === 0 ? (
              <EmptyState
                title="No expenses yet"
                action={
                  canManage ? <Link href={`/groups/${groupId}/expenses/new`} className="button small">Record the first expense</Link> : undefined
                }
              >
                The ledger starts with the first shared purchase.
              </EmptyState>
            ) : (
              <div className="table-wrap">
                <table className="ledger">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Description</th>
                      <th scope="col">Payer</th>
                      <th scope="col" className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentExpenses.map((expense) => (
                      <tr key={expense.id}>
                        <td className="mono small">{expense.occurredOn}</td>
                        <td>
                          <Link href={`/groups/${groupId}/expenses/${expense.id}`} className="row-link">{expense.description}</Link>
                          {expense.status === "VOID" ? <Badge variant="void">void</Badge> : null}
                        </td>
                        <td>{expense.payerName}</td>
                        <td className="num"><Money minor={expense.amountMinor} currency={data.group.currency} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2>Recent changes</h2>
            <Link href={`/groups/${groupId}/audit`} className="small">Audit log</Link>
          </div>
          <div className="card-body">
            {data.recentAudit.length === 0 ? (
              <p className="small muted">No audit events yet.</p>
            ) : (
              <ul className="timeline">
                {data.recentAudit.map((event) => (
                  <li key={event.id}>
                    <div className="when">
                      {event.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC · {event.actorName ?? "System"}
                    </div>
                    <div className="what">{actionLabel(event.action)}{event.reason ? ` — ${event.reason}` : ""}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {canManage && data.pendingInvites.length > 0 ? (
        <section className="card">
          <div className="card-header">
            <h2>Pending invitations</h2>
            <Link href={`/groups/${groupId}/participants`} className="small">Manage people</Link>
          </div>
          <div className="card-body">
            <div className="table-wrap">
              <table className="ledger">
                <thead>
                  <tr>
                    <th scope="col">Email</th>
                    <th scope="col">Role</th>
                    <th scope="col">Expires</th>
                    <th scope="col">Invited by</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pendingInvites.map((invite) => (
                    <tr key={invite.id}>
                      <td>{invite.email}</td>
                      <td><Badge>{invite.role.toLowerCase()}</Badge></td>
                      <td className="mono small">{invite.expiresAt.toISOString().slice(0, 10)}</td>
                      <td>{invite.inviterName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted" style={{ marginTop: "0.7rem" }}>
              Raw invitation links are only shown when created. Create a fresh invite to get a new link.
            </p>
          </div>
        </section>
      ) : null}

      <section className="notice">
        <strong>What you see is derived from records.</strong> Balances include active expenses and recorded payments only.
        Voided expenses and reversed payments remain in the audit history but are excluded from effective balances.
        Category labels such as {CATEGORY_LABELS.DINING as ExpenseCategory} are attached per expense, not inferred from text.
      </section>
    </div>
  );
}
