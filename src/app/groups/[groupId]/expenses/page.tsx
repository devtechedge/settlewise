import type { Metadata } from "next";
import Link from "next/link";
import { requirePageAuth } from "@/auth/page-auth";
import { canEditTransactions, getMembership } from "@/auth/rbac";
import { listExpenses } from "@/repositories/expenses";
import { listParticipants } from "@/repositories/groups";
import { EXPENSE_CATEGORIES, CATEGORY_LABELS } from "@/domain/money/currency";
import { isoDateSchema } from "@/validation/schemas";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { Money } from "@/components/money";

export const metadata: Metadata = { title: "Expenses", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ExpensesPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { groupId } = await params;
  const query = await searchParams;
  const auth = await requirePageAuth(`/groups/${groupId}/expenses`);
  const membership = await getMembership(groupId, auth.user.id);
  if (!membership) return null;
  const canEdit = membership.groupStatus === "ACTIVE" && canEditTransactions(membership.role);

  const read = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : "");
  const q = read("q");
  const category = read("category");
  const payer = read("payer");
  const statusRaw = read("status");
  const fromRaw = read("from");
  const toRaw = read("to");
  const page = Math.max(1, Number(read("page")) || 1);
  const from = fromRaw && isoDateSchema.safeParse(fromRaw).success ? fromRaw : undefined;
  const to = toRaw && isoDateSchema.safeParse(toRaw).success ? toRaw : undefined;
  const status = statusRaw === "ACTIVE" || statusRaw === "VOID" ? statusRaw : undefined;
  const dateFilterInvalid = (fromRaw && !from) || (toRaw && !to);

  const [result, participants] = await Promise.all([
    listExpenses({
      groupId,
      query: q || undefined,
      category: category || undefined,
      payerParticipantId: payer || undefined,
      status,
      from,
      to,
      page,
      pageSize: 25,
    }),
    listParticipants(groupId),
  ]);

  const filterActive = Boolean(q || category || payer || statusRaw || fromRaw || toRaw);

  function pageHref(nextPage: number) {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === "string" && key !== "page") next.set(key, value);
    }
    next.set("page", String(nextPage));
    return `?${next.toString()}`;
  }

  return (
    <div>
      <PageHeader
        eyebrow="Expense ledger"
        title="Every shared cost"
        description={`Ordered by occurrence date. All amounts are in ${membership.currency}. Voided entries remain visible but are excluded from balances.`}
        actions={
          canEdit ? (
            <>
              <Link href={`/groups/${groupId}/imports`} className="button secondary">Import CSV</Link>
              <Link href={`/groups/${groupId}/expenses/new`} className="button">New expense</Link>
            </>
          ) : undefined
        }
      />

      {dateFilterInvalid ? (
        <div className="alert" role="alert" style={{ marginBottom: "1rem" }}>
          One of the date filters is invalid. Use YYYY-MM-DD, on or before today.
        </div>
      ) : null}

      <form method="get" className="filter-bar" role="search" aria-label="Filter expenses">
        <div className="field grow">
          <label htmlFor="filter-q">Search descriptions</label>
          <input id="filter-q" name="q" defaultValue={q} maxLength={120} placeholder="Dinner, rent, groceries..." />
        </div>
        <div className="field">
          <label htmlFor="filter-category">Category</label>
          <select id="filter-category" name="category" defaultValue={category}>
            <option value="">All</option>
            {EXPENSE_CATEGORIES.map((value) => (
              <option key={value} value={value}>{CATEGORY_LABELS[value]}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="filter-payer">Payer</label>
          <select id="filter-payer" name="payer" defaultValue={payer}>
            <option value="">Anyone</option>
            {participants.map((participant) => (
              <option key={participant.id} value={participant.id}>{participant.displayName}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="filter-status">Status</label>
          <select id="filter-status" name="status" defaultValue={statusRaw}>
            <option value="">Active and void</option>
            <option value="ACTIVE">Active only</option>
            <option value="VOID">Voided only</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="filter-from">From</label>
          <input id="filter-from" type="date" name="from" defaultValue={fromRaw} max={new Date().toISOString().slice(0, 10)} />
        </div>
        <div className="field">
          <label htmlFor="filter-to">To</label>
          <input id="filter-to" type="date" name="to" defaultValue={toRaw} max={new Date().toISOString().slice(0, 10)} />
        </div>
        <div className="form-actions" style={{ paddingTop: 0 }}>
          <button type="submit" className="button secondary small">Apply</button>
          {filterActive ? <Link href={`/groups/${groupId}/expenses`} className="button ghost small">Clear</Link> : null}
        </div>
      </form>

      {result.rows.length === 0 ? (
        <EmptyState
          title={filterActive ? "No expenses match these filters" : "The ledger is empty"}
          action={
            filterActive ? (
              <Link href={`/groups/${groupId}/expenses`} className="button secondary">Clear filters</Link>
            ) : canEdit ? (
              <Link href={`/groups/${groupId}/expenses/new`} className="button">Record the first expense</Link>
            ) : undefined
          }
        >
          {filterActive
            ? "Try a wider date range or a different participant. Filters are applied on the server."
            : "Once the first shared purchase is recorded, its payer and beneficiaries will appear here."}
        </EmptyState>
      ) : (
        <>
          <p className="small muted" role="status">
            Showing {result.rows.length} of {result.total} expense{result.total === 1 ? "" : "s"}.
          </p>
          <div className="card">
            <div className="table-wrap">
              <table className="ledger">
                <caption className="visually-hidden">Expense ledger, newest occurrence first.</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Description</th>
                    <th scope="col">Category</th>
                    <th scope="col">Payer</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((expense) => (
                    <tr key={expense.id}>
                      <td className="mono small nowrap">{expense.occurredOn}</td>
                      <td className="description">
                        <Link href={`/groups/${groupId}/expenses/${expense.id}`} className="row-link">
                          {expense.description}
                        </Link>
                        <span className="small muted"> · {expense.splitCount} {expense.splitCount === 1 ? "beneficiary" : "beneficiaries"}</span>
                      </td>
                      <td className="small">{CATEGORY_LABELS[expense.category as keyof typeof CATEGORY_LABELS] ?? expense.category}</td>
                      <td>{expense.payerName}</td>
                      <td>
                        {expense.status === "VOID" ? <Badge variant="void">void</Badge> : <Badge variant="active">active</Badge>}
                      </td>
                      <td className="num"><Money minor={expense.amountMinor} currency={membership.currency} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {result.pageCount > 1 ? (
            <nav className="pagination" aria-label="Expense pages">
              {result.page > 1 ? <Link href={pageHref(result.page - 1)}>Previous</Link> : null}
              <span className="current" aria-current="page">Page {result.page} of {result.pageCount}</span>
              {result.page < result.pageCount ? <Link href={pageHref(result.page + 1)}>Next</Link> : null}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
