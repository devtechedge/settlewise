import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <article className="narrow legal">
      <p className="updated">Last updated 25 October 2026</p>
      <h1>Privacy notice</h1>
      <p className="lede">
        Settlewise stores the account and ledger information needed to calculate shared balances. This notice describes
        what is collected, why, and what happens when records are deleted.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Account details: display name, email address, password hash, and account timestamps.</li>
        <li>Session and security data: hashed session tokens, browser user-agent, and a hashed network identifier used for rate limiting.</li>
        <li>Group data: group name, membership and role, invitations, participant names, and participant-to-account links.</li>
        <li>Financial records: expenses, payers, split allocations, notes, currencies, budgets, recorded reimbursements, revisions, audit events, and exports.</li>
        <li>Import data: uploaded filenames, checksums, column mappings, row data, validation errors, and the expense records created from them.</li>
      </ul>
      <p>
        Settlewise does not collect card details, bank credentials, or payment-provider tokens. It does not connect to a
        financial institution and does not initiate transfers.
      </p>

      <h2>How data is used</h2>
      <p>
        Data is used to authenticate you, enforce group permissions, calculate balances and settlement plans, provide
        audit history, process imports and exports, and protect the service from abuse. We do not sell personal data or
        use it for advertising. The application does not load third-party analytics scripts.
      </p>

      <h2>Cookies and local storage</h2>
      <p>
        One essential cookie holds an opaque session token. The database stores only a hash of that token. A local
        browser preference stores your light or dark theme choice. No advertising or cross-site tracking cookies are
        used.
      </p>

      <h2>Where data is processed</h2>
      <p>
        The application is hosted on Vercel and uses a managed PostgreSQL database. Those providers process data on our
        behalf to run and secure the service. The current deployment is described in the project README. Data may be
        processed outside your country of residence.
      </p>

      <h2>Retention and deletion</h2>
      <ul>
        <li>Group owners can archive a group or delete it. Deleting a group permanently removes its ledger, imports, payments, audit events, and invitations.</li>
        <li>Account deletion requires you to transfer ownership of groups or delete them first. The account email, name, password, sessions, and memberships are then removed or disabled.</li>
        <li>Financial records that must remain for the integrity of another group&apos;s ledger are retained with an anonymized participant label. The former account is no longer usable.</li>
        <li>Import previews expire after one hour. Uploaded raw rows remain attached to a committed or expired batch until the group is deleted, because they explain the provenance of ledger records.</li>
        <li>Sessions expire after 30 days and can be revoked earlier from the account page.</li>
      </ul>

      <h2>Your controls</h2>
      <p>
        You can export account data as JSON from account settings, export each group&apos;s expenses, payments, and audit
        log as CSV, revoke sessions, and delete your account. Use the <Link href="/settings">settings page</Link> for
        these controls.
      </p>

      <h2>Security</h2>
      <p>
        Passwords are hashed with scrypt. Sessions use random opaque tokens stored as hashes. Every group query is scoped
        to an active membership. No system is perfectly secure, so use a unique password and avoid placing sensitive
        personal details in expense descriptions or notes.
      </p>

      <h2>Contact</h2>
      <p>
        For privacy questions or deletion help, open an issue at{" "}
        <a href="https://github.com/devtechedge/settlewise/issues" rel="noreferrer">
          github.com/devtechedge/settlewise/issues
        </a>
        . Do not include passwords, session tokens, or full financial records in a public issue.
      </p>
    </article>
  );
}
