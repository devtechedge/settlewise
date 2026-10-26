import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageAuth } from "@/auth/page-auth";
import { canEditTransactions, getMembership } from "@/auth/rbac";
import { defaultReportRange, getReports } from "@/services/reports";
import { isoDateSchema } from "@/validation/schemas";
import { formatMinor } from "@/domain/money/money";
import { BarChart, EmptyState, PageHeader, Stat } from "@/components/ui";
import { Money } from "@/components/money";
import { MonthChart } from "@/components/month-chart";
import { BudgetForm } from "@/components/budget-form";

export const metadata: Metadata = { title: "Reports", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { groupId } = await params;
  const query = await searchParams;
  const auth = await requirePageAuth(`/groups/${groupId}/reports`);
  const membership = await getMembership(groupId, auth.user.id);
  if (!membership) notFound();

  const defaults = defaultReportRange();
  const fromValid = query.from ? isoDateSchema.safeParse(query.from).success : true;
  const toValid = query.to ? isoDateSchema.safeParse(query.to).success : true;
  const range = {
    from: fromValid && query.from ? query.from : defaults.from,
    to: toValid && query.to ? query.to : defaults.to,
  };
  const data = await getReports(groupId, auth.user.id, range);
  if (!data) notFound();
  const canEdit = membership.groupStatus === "ACTIVE" && canEditTransactions(membership.role);
  const exportQuery = `from=${range.from}&to=${range.to}`;

  return (
    <div className="stack-lg">
      <PageHeader
        eyebrow="Period reporting"
        title="Reports"
        description={`Every value is derived from persisted records between ${range.from} and ${range.to}, in ${membership.currency}. Charts are paired with exact numbers.`}
        actions={
          <>
            <a className="button secondary" href={`/api/groups/${groupId}/exports?type=expenses&${exportQuery}`}>Expenses CSV</a>
            <a className="button secondary" href={`/api/groups/${groupId}/exports?type=settlements&${exportQuery}`}>Payments CSV</a>
            <a className="button secondary" href={`/api/groups/${groupId}/exports?type=audit&${exportQuery}`}>Audit CSV</a>
          </>
        }
      />

      {(!fromValid || !toValid) ? (
        <div className="alert" role="alert">An invalid date was ignored. Use YYYY-MM-DD, on or before today.</div>
      ) : null}

      <form method="get" className="filter-bar" aria-label="Report period">
        <div className="field">
          <label htmlFor="report-from">From</label>
          <input id="report-from" type="date" name="from" defaultValue={range.from} max={new Date().toISOString().slice(0, 10)} />
        </div>
        <div className="field">
          <label htmlFor="report-to">To</label>
          <input id="report-to" type="date" name="to" defaultValue={range.to} max={new Date().toISOString().slice(0, 10)} />
        </div>
        <div className="form-actions" style={{ paddingTop: 0 }}>
          <button type="submit" className="button secondary small">Update period</button>
          <Link href={`/groups/${groupId}/reports`} className="button ghost small">Reset</Link>
        </div>
      </form>

      <div className="grid-3">
        <Stat
          label="Spending in period"
          value={<Money minor={data.totalMinor} currency={membership.currency} />}
          note={`${data.expenseCount} active expense${data.expenseCount === 1 ? "" : "s"}`}
        />
        <Stat
          label="Recorded reimbursements"
          value={<Money minor={data.payments.totalMinor} currency={membership.currency} />}
          note={`${data.payments.count} recorded payment${data.payments.count === 1 ? "" : "s"} in period`}
        />
        <Stat
          label="Open obligations now"
          value={<Money minor={data.balances.reduce((acc, row) => (row.netMinor < 0n ? acc - row.netMinor : acc), 0n)} currency={membership.currency} />}
          note="All-time net position, not just this period"
        />
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-header"><h2>Spending by category</h2></div>
          <div className="card-body">
            <BarChart
              rows={data.byCategory.map((row) => ({ label: row.label, valueMinor: row.totalMinor, note: `${row.count} expenses` }))}
              currency={membership.currency}
            />
            {data.byCategory.length > 0 ? (
              <div className="table-wrap" style={{ marginTop: "1rem" }}>
                <table className="ledger">
                  <thead>
                    <tr><th scope="col">Category</th><th scope="col" className="num">Expenses</th><th scope="col" className="num">Total</th></tr>
                  </thead>
                  <tbody>
                    {data.byCategory.map((row) => (
                      <tr key={row.category}>
                        <td>{row.label}</td>
                        <td className="num">{row.count}</td>
                        <td className="num"><Money minor={row.totalMinor} currency={membership.currency} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </section>

        <section className="card">
          <div className="card-header"><h2>Spending by month</h2></div>
          <div className="card-body">
            <MonthChart rows={data.byMonth.map((row) => ({ month: row.month, totalMinor: row.totalMinor }))} currency={membership.currency} />
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-header">
          <h2>Contribution comparison</h2>
          <span className="small muted">what each participant paid vs consumed</span>
        </div>
        <div className="card-body">
          {data.contributions.length === 0 ? (
            <EmptyState title="No participants">Add participants to compare contributions.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="ledger">
                <thead>
                  <tr>
                    <th scope="col">Participant</th>
                    <th scope="col" className="num">Paid</th>
                    <th scope="col" className="num">Allocated share</th>
                    <th scope="col" className="num">Paid minus share</th>
                  </tr>
                </thead>
                <tbody>
                  {data.contributions.map((row) => {
                    const net = BigInt(row.paidMinor) - BigInt(row.owedMinor);
                    return (
                      <tr key={row.participantId}>
                        <td>{row.displayName}</td>
                        <td className="num"><Money minor={row.paidMinor} currency={membership.currency} /></td>
                        <td className="num"><Money minor={row.owedMinor} currency={membership.currency} /></td>
                        <td className="num"><Money minor={net} currency={membership.currency} signed note /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="small muted" style={{ marginTop: "0.7rem" }}>
            Paid vs allocated share is scoped to this period. Recorded reimbursements are shown separately above and are
            not mixed into contribution totals.
          </p>
        </div>
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-header">
            <h2>Budgets</h2>
            <span className="small muted">persisted limits</span>
          </div>
          <div className="card-body stack">
            {data.budgets.length === 0 ? (
              <p className="small muted">No budgets set for this group.</p>
            ) : (
              data.budgets.map((budget) => {
                const spent = BigInt(budget.spentMinor);
                const limit = BigInt(budget.limitMinor);
                const percent = Number((spent * 1000n) / limit) / 10;
                const over = spent > limit;
                return (
                  <div key={budget.id}>
                    <div className="cluster" style={{ justifyContent: "space-between" }}>
                      <span className="small">{budget.label} · {budget.period === "MONTHLY" ? "this month" : "all time"}</span>
                      <span className="mono small">{formatMinor(spent, membership.currency)} / {formatMinor(limit, membership.currency)}</span>
                    </div>
                    <div className={`budget-meter ${over ? "over" : ""}`} style={{ marginTop: "0.35rem" }}>
                      <span style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
                    </div>
                    <p className="small" style={{ margin: "0.25rem 0 0", color: over ? "var(--danger)" : "var(--muted)" }}>
                      {over ? `Over by ${formatMinor(spent - limit, membership.currency)}` : `${percent.toFixed(1)}% consumed`}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-header"><h2>Set a budget</h2></div>
          <div className="card-body">
            {canEdit ? (
              <BudgetForm groupId={groupId} currency={membership.currency} />
            ) : (
              <p className="small muted">Budget limits are set by owners and editors.</p>
            )}
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-header">
          <h2>Recent exports</h2>
          <span className="small muted">checksummed records</span>
        </div>
        <div className="card-body">
          {data.recentExports.length === 0 ? (
            <p className="small muted">No exports recorded yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="ledger">
                <thead>
                  <tr><th scope="col">Created</th><th scope="col">Type</th><th scope="col" className="num">Rows</th><th scope="col">Filters</th></tr>
                </thead>
                <tbody>
                  {data.recentExports.map((record) => {
                    const filters = record.filters as { type?: string; from?: string | null; to?: string | null };
                    return (
                      <tr key={record.id}>
                        <td className="mono small">{record.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                        <td>{filters.type ?? record.format}</td>
                        <td className="num">{record.rowCount}</td>
                        <td className="small muted">
                          {filters.from ?? "any"} to {filters.to ?? "any"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
