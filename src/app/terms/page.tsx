import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <article className="narrow legal">
      <p className="updated">Last updated 25 October 2026</p>
      <h1>Terms of use</h1>
      <p className="lede">
        Settlewise is a record-keeping and settlement-planning tool. These terms set the boundary of what it promises.
      </p>

      <h2>What Settlewise is</h2>
      <p>
        Settlewise helps a group record shared expenses, calculate balances, keep an audit history, and suggest
        reimbursements. Balances are calculated from records you enter. Suggested transfers are informational only.
      </p>

      <h2>What Settlewise is not</h2>
      <ul>
        <li>It is not a bank, payment processor, wallet, credit product, or investment service.</li>
        <li>Recording a reimbursement does not transfer money. You are responsible for any real transfer made outside the app.</li>
        <li>It does not connect to bank accounts and must not be used to store card numbers or banking credentials.</li>
        <li>It does not provide financial, legal, or tax advice.</li>
        <li>The settlement planner uses a deterministic greedy strategy. It does not guarantee the minimum possible number of transfers in every case.</li>
      </ul>

      <h2>Your account</h2>
      <p>
        You must provide accurate account information, keep your password secure, and be old enough to enter a binding
        agreement in your jurisdiction. You are responsible for activity under your account. Notify us through the
        project issue tracker if you believe your account is compromised.
      </p>

      <h2>Group content and permissions</h2>
      <p>
        You are responsible for the participants, expenses, notes, and imports you add. Group owners control membership,
        currency, and deletion. Editors can create and correct transactions. Members can view the group and record
        payments they send. Do not upload another person&apos;s financial records without permission.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not attempt to access groups you are not a member of.</li>
        <li>Do not upload malware, deliberately malformed payloads, or data you do not have the right to process.</li>
        <li>Do not use the service to harass, defraud, or misrepresent money movement.</li>
        <li>Do not probe, overload, or bypass rate limits and authorization controls.</li>
      </ul>

      <h2>Availability and changes</h2>
      <p>
        The service is provided as-is, without a service-level guarantee. Features may change, and a deployment may be
        reset if it is explicitly marked as demo data. Export records you need to keep. We may suspend accounts that
        threaten the service or violate these terms.
      </p>

      <h2>Data and deletion</h2>
      <p>
        Your use of personal data is described in the <Link href="/privacy">privacy notice</Link>. Deleting a group
        permanently removes its records. Deleting an account requires you to transfer or delete owned groups first; some
        financial records may remain with an anonymized participant label to preserve another group&apos;s ledger.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Settlewise and its operator are not liable for indirect, incidental, or
        consequential losses arising from use of the service, including disputes between participants, reliance on a
        suggested transfer, or data loss. Verify balances and transfers independently before sending money.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms can be raised at{" "}
        <a href="https://github.com/devtechedge/settlewise/issues" rel="noreferrer">
          github.com/devtechedge/settlewise/issues
        </a>
        .
      </p>
    </article>
  );
}
