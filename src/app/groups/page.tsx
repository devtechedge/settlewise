import type { Metadata } from "next";
import Link from "next/link";
import { requirePageAuth } from "@/auth/page-auth";
import { listGroupsForUser } from "@/repositories/groups";
import { Money } from "@/components/money";
import { Badge, EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Groups", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const auth = await requirePageAuth("/groups");
  const groups = await listGroupsForUser(auth.user.id);

  return (
    <div className="container">
      <PageHeader
        eyebrow={`${groups.length} active ledger${groups.length === 1 ? "" : "s"}`}
        title={`Groups for ${auth.user.displayName}`}
        description="Each group keeps one currency and one canonical ledger. Open a group to see balances, recent changes, and the next settlement actions."
        actions={<Link href="/groups/new" className="button">New group</Link>}
      />

      {groups.length === 0 ? (
        <EmptyState
          title="No groups yet"
          action={<Link href="/groups/new" className="button">Create your first group</Link>}
        >
          Start a household, a trip, or a club. Add participants who do not need accounts, or invite people by email.
        </EmptyState>
      ) : (
        <div className="grid-3">
          {groups.map((group) => (
            <article className="card" key={group.id}>
              <div className="card-header">
                <h2 style={{ fontSize: "1.35rem" }}>
                  <Link href={`/groups/${group.id}`} className="row-link" style={{ color: "inherit" }}>
                    {group.name}
                  </Link>
                </h2>
                <Badge variant={group.role.toLowerCase()}>{group.role}</Badge>
              </div>
              <div className="card-body">
                <div className="detail-list">
                  <div className="detail-row">
                    <dt>Recorded spending</dt>
                    <dd><Money minor={group.totalMinor} currency={group.currency} /></dd>
                  </div>
                  <div className="detail-row">
                    <dt>Expenses</dt>
                    <dd className="mono">{group.expenseCount}</dd>
                  </div>
                  <div className="detail-row">
                    <dt>Participants</dt>
                    <dd className="mono">{group.participantCount}</dd>
                  </div>
                  <div className="detail-row">
                    <dt>Members</dt>
                    <dd className="mono">{group.memberCount}</dd>
                  </div>
                  <div className="detail-row">
                    <dt>Currency</dt>
                    <dd className="mono">{group.currency}</dd>
                  </div>
                </div>
                <div className="form-actions" style={{ marginTop: "1rem" }}>
                  <Link href={`/groups/${group.id}`} className="button secondary small">Open ledger</Link>
                  <Link href={`/groups/${group.id}/expenses/new`} className="button ghost small">Add expense</Link>
                </div>
                {group.status === "ARCHIVED" ? <p className="small muted" style={{ marginTop: "0.7rem" }}>Archived. Read-only until restored.</p> : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
