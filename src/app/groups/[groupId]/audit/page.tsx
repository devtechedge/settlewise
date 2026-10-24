import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageAuth } from "@/auth/page-auth";
import { getMembership } from "@/auth/rbac";
import { listAuditActions, listAuditEvents } from "@/services/audit";
import { Badge, EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Audit log", robots: { index: false } };
export const dynamic = "force-dynamic";

function actionLabel(action: string) {
  return action
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ page?: string; action?: string }>;
}) {
  const { groupId } = await params;
  const query = await searchParams;
  const auth = await requirePageAuth(`/groups/${groupId}/audit`);
  const membership = await getMembership(groupId, auth.user.id);
  if (!membership) notFound();
  const page = Math.max(1, Number(query.page) || 1);
  const action = query.action && query.action.length > 0 ? query.action : undefined;
  const [data, actions] = await Promise.all([
    listAuditEvents(groupId, auth.user.id, { page, pageSize: 30, action }),
    listAuditActions(groupId),
  ]);

  function pageHref(nextPage: number) {
    const params = new URLSearchParams();
    if (action) params.set("action", action);
    params.set("page", String(nextPage));
    return `?${params.toString()}`;
  }

  return (
    <div>
      <PageHeader
        eyebrow="Append-only history"
        title="Audit log"
        description="Actor, time, action, target, reason, and revision references. Corrections and reversals add events; they do not erase prior ones."
        actions={<a className="button secondary" href={`/api/groups/${groupId}/exports?type=audit`}>Export audit CSV</a>}
      />
      <form method="get" className="filter-bar" aria-label="Filter audit events">
        <div className="field grow">
          <label htmlFor="audit-action">Action</label>
          <select id="audit-action" name="action" defaultValue={action ?? ""}>
            <option value="">All actions</option>
            {actions.map((value) => (
              <option key={value} value={value}>{actionLabel(value)}</option>
            ))}
          </select>
        </div>
        <div className="form-actions" style={{ paddingTop: 0 }}>
          <button type="submit" className="button secondary small">Filter</button>
          {action ? <Link href={`/groups/${groupId}/audit`} className="button ghost small">Clear</Link> : null}
        </div>
      </form>

      {data.rows.length === 0 ? (
        <EmptyState title={action ? "No events for this action" : "No audit events yet"}>
          Events appear when expenses, payments, memberships, imports, budgets, or settings change.
        </EmptyState>
      ) : (
        <>
          <div className="card">
            <div className="table-wrap">
              <table className="ledger">
                <caption className="visually-hidden">Audit events, newest first.</caption>
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">Actor</th>
                    <th scope="col">Action</th>
                    <th scope="col">Target</th>
                    <th scope="col">Reason</th>
                    <th scope="col">Revision</th>
                    <th scope="col">Metadata</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((event) => (
                    <tr key={event.id}>
                      <td className="mono small nowrap">{event.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                      <td>{event.actorName ?? "System"}</td>
                      <td>{actionLabel(event.action)}</td>
                      <td className="small">
                        {event.targetType}
                        {event.targetId ? <span className="mono small muted"> · {event.targetId.slice(0, 8)}</span> : null}
                      </td>
                      <td className="small">{event.reason ?? "—"}</td>
                      <td className="small mono">
                        {event.beforeRevision !== null && event.afterRevision !== null
                          ? `${event.beforeRevision} → ${event.afterRevision}`
                          : event.afterRevision ?? "—"}
                      </td>
                      <td>
                        {event.metadata ? (
                          <details>
                            <summary className="small">View</summary>
                            <pre className="small" style={{ whiteSpace: "pre-wrap", maxWidth: "320px", margin: "0.4rem 0 0" }}>
                              {JSON.stringify(event.metadata, null, 2)}
                            </pre>
                          </details>
                        ) : (
                          <span className="small muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="cluster" style={{ justifyContent: "space-between", marginTop: "0.8rem" }}>
            <span className="small muted" role="status">
              {data.total} event{data.total === 1 ? "" : "s"} · page {data.page} of {data.pageCount}
            </span>
            {data.pageCount > 1 ? (
              <nav className="pagination" aria-label="Audit pages">
                {data.page > 1 ? <Link href={pageHref(data.page - 1)}>Previous</Link> : null}
                <span className="current">Page {data.page}</span>
                {data.page < data.pageCount ? <Link href={pageHref(data.page + 1)}>Next</Link> : null}
              </nav>
            ) : null}
          </div>
        </>
      )}
      <p className="small muted" style={{ marginTop: "1rem" }}>
        <Badge>Retention</Badge> Deleting the group also deletes this audit history. Export it first if you need a copy.
      </p>
    </div>
  );
}
