import type { Metadata } from "next";
import Link from "next/link";
import { requirePageAuth } from "@/auth/page-auth";
import { getAccountOverview } from "@/services/account";
import { Badge, PageHeader } from "@/components/ui";
import { ProfileForm } from "@/components/account-forms";
import { SessionsAdmin } from "@/components/sessions-admin";

export const metadata: Metadata = { title: "Account", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const auth = await requirePageAuth("/account");
  const overview = await getAccountOverview(auth.user.id);

  return (
    <div className="container stack-lg">
      <PageHeader
        eyebrow="Account"
        title={overview.user.displayName}
        description={`Signed in as ${overview.user.email}. Member since ${overview.user.createdAt.toISOString().slice(0, 10)}.`}
        actions={
          <>
            <a className="button secondary" href="/api/account/export">Export account JSON</a>
            <Link className="button" href="/settings">Security settings</Link>
          </>
        }
      />

      <section className="card">
        <div className="card-header"><h2>Profile</h2></div>
        <div className="card-body">
          <ProfileForm initialName={overview.user.displayName} email={overview.user.email} />
        </div>
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-header">
            <h2>Group memberships</h2>
            <span className="small muted">{overview.memberships.length} total</span>
          </div>
          <div className="card-body">
            {overview.memberships.length === 0 ? (
              <p className="small muted">No memberships.</p>
            ) : (
              <div className="table-wrap">
                <table className="ledger">
                  <thead>
                    <tr><th scope="col">Group</th><th scope="col">Role</th><th scope="col">Status</th></tr>
                  </thead>
                  <tbody>
                    {overview.memberships.map((membership) => (
                      <tr key={membership.groupId}>
                        <td><Link href={`/groups/${membership.groupId}`}>{membership.groupName}</Link></td>
                        <td><Badge variant={membership.role.toLowerCase()}>{membership.role.toLowerCase()}</Badge></td>
                        <td className="small">{membership.status.toLowerCase()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {overview.ownedGroups.length > 0 ? (
              <p className="small muted" style={{ marginTop: "0.8rem" }}>
                You own {overview.ownedGroups.length} group{overview.ownedGroups.length === 1 ? "" : "s"}. Account deletion
                requires transferring or deleting {overview.ownedGroups.length === 1 ? "it" : "them"} first.
              </p>
            ) : null}
          </div>
        </section>

        <section className="card">
          <div className="card-header"><h2>Privacy and data</h2></div>
          <div className="card-body stack">
            <p className="small">
              Export your account metadata as JSON. Group financial records are exported per group from the reports page,
              with expenses, payments, and audit logs available separately.
            </p>
            <div className="form-actions">
              <a className="button secondary small" href="/api/account/export">Account JSON</a>
              <Link className="button ghost small" href="/privacy">Privacy notice</Link>
              <Link className="button ghost small" href="/terms">Terms</Link>
            </div>
            <p className="small muted">
              Account deletion is in <Link href="/settings">settings</Link>. A group owner must transfer or delete groups
              before their account can be removed.
            </p>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-header">
          <h2>Active sessions</h2>
          <span className="small muted">hashed tokens, 30-day expiry</span>
        </div>
        <div className="card-body">
          <SessionsAdmin
            sessions={overview.sessions.map((session) => ({
              id: session.id,
              createdAt: session.createdAt.toISOString(),
              lastUsedAt: session.lastUsedAt.toISOString(),
              expiresAt: session.expiresAt.toISOString(),
              userAgent: session.userAgent,
            }))}
            currentSessionId={auth.sessionId}
          />
        </div>
      </section>
    </div>
  );
}
