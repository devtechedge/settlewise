import type { Metadata } from "next";
import Link from "next/link";
import { requirePageAuth } from "@/auth/page-auth";
import { getAccountOverview } from "@/services/account";
import { PageHeader } from "@/components/ui";
import { DeleteAccountForm, PasswordForm } from "@/components/account-forms";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const auth = await requirePageAuth("/settings");
  const overview = await getAccountOverview(auth.user.id);

  return (
    <div className="container stack-lg">
      <PageHeader
        eyebrow="Settings"
        title="Security and data controls"
        description="Change your password, review active sessions, export your data, or delete the account. Group ledgers stay under each owner's control."
        actions={<Link href="/account" className="button secondary">Back to account</Link>}
      />

      <section className="card">
        <div className="card-header"><h2>Change password</h2></div>
        <div className="card-body">
          <PasswordForm />
        </div>
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-header"><h2>Export your data</h2></div>
          <div className="card-body stack">
            <p className="small">
              The account export contains profile data, memberships, owned groups, and session metadata. It does not
              contain other participants&apos; records.
            </p>
            <div className="form-actions">
              <a className="button secondary" href="/api/account/export">Download account JSON</a>
            </div>
            <p className="small muted">
              For a group ledger, open that group&apos;s reports page and export expenses, payments, or audit history as
              CSV.
            </p>
            <div className="form-actions">
              <Link href="/groups" className="button ghost small">Choose a group</Link>
              <Link href="/privacy" className="button ghost small">Retention policy</Link>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-header"><h2>Sessions</h2></div>
          <div className="card-body stack">
            <p className="small">
              You have {overview.sessions.length} active session{overview.sessions.length === 1 ? "" : "s"}. Changing your
              password or deleting the account revokes other sessions.
            </p>
            <Link href="/account" className="button secondary">Review sessions</Link>
            <p className="small muted">
              Sessions are random opaque tokens; only their hashes are stored. They expire after 30 days.
            </p>
          </div>
        </section>
      </div>

      <section className="danger-zone stack">
        <div>
          <h2>Delete account</h2>
          <p className="small">
            This is permanent. Export your account and every group ledger you need before continuing. If you own any group,
            transfer ownership or delete the group first.
          </p>
        </div>
        <DeleteAccountForm
          ownedGroups={overview.ownedGroups.map((group) => ({ id: group.id, name: group.name }))}
        />
      </section>
    </div>
  );
}
