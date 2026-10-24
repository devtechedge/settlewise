import Link from "next/link";
import { computeSettlementPlan } from "@/domain/settlement/settlement";
import { formatMinor } from "@/domain/money/money";
import { DemoLoginButton } from "@/components/demo-login-button";
import { IllustrativeSplit } from "@/components/illustrative-split";

const examplePlan = computeSettlementPlan({
  expenses: [
    {
      payerParticipantId: "p-maya",
      amountMinor: 300000n,
      splits: [
        { participantId: "p-maya", allocatedMinor: 100000n },
        { participantId: "p-arjun", allocatedMinor: 100000n },
        { participantId: "p-leela", allocatedMinor: 100000n },
      ],
    },
    {
      payerParticipantId: "p-arjun",
      amountMinor: 90000n,
      splits: [
        { participantId: "p-arjun", allocatedMinor: 45000n },
        { participantId: "p-leela", allocatedMinor: 45000n },
      ],
    },
  ],
  participantIds: ["p-arjun", "p-leela", "p-maya"],
});

export default function LandingPage() {
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Shared expense ledger</p>
            <h1>
              Split the bill.
              <br />
              Keep the <em>record</em> straight.
            </h1>
            <p className="lede">
              Settlewise records who paid, who benefited, and what is still owed. Every balance comes from the ledger,
              every correction leaves a trail, and every suggested transfer reconciles to the exact minor unit.
            </p>
            <div className="hero-actions">
              <Link href="/signup" className="button">
                Start a ledger
              </Link>
              <DemoLoginButton />
            </div>
            <p className="small muted" style={{ marginTop: "1.1rem" }}>
              For households, trips, and clubs. No bank connection. No payment processing. No invented money movement.
            </p>
          </div>

          <aside className="hero-ledger" aria-label="Illustrative settlement example">
            <div className="ledger-stamp">
              <span>Ledger 01</span>
              <span>INR · household</span>
            </div>
            <h2>Dinner at Kala Ghoda</h2>
            <p className="sub">Maya paid ₹3,000 for three people. Arjun paid ₹900 for two.</p>
            <div className="settlement-line">
              <span>Arjun</span>
              <span className="arrow" aria-hidden="true">
                →
              </span>
              <span className="to">Maya</span>
              <span className="amt">{formatMinor(examplePlan.transfers[0]?.amountMinor ?? 0n, "INR")}</span>
            </div>
            <div className="settlement-line">
              <span>Leela</span>
              <span className="arrow" aria-hidden="true">
                →
              </span>
              <span className="to">Maya</span>
              <span className="amt">{formatMinor(examplePlan.transfers[1]?.amountMinor ?? 0n, "INR")}</span>
            </div>
            <p className="footnote">
              Suggested plan, not a completed payment. Total transfers:{" "}
              {formatMinor(examplePlan.totalMinor, "INR")} from {formatMinor(examplePlan.debtorTotalMinor, "INR")} owed.
              This worked example is illustrative. Your data starts empty.
            </p>
            <IllustrativeSplit />
          </aside>
        </div>
      </section>

      <section className="section alt">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">The working parts</p>
            <h2>A ledger that can explain itself</h2>
            <p className="lede">
              The interface is built around reconciliation, not decoration. Each number can be traced to a recorded
              transaction, a split rule, or a documented correction.
            </p>
          </div>
          <div className="feature-grid">
            <article className="feature">
              <div className="index">01 / record</div>
              <h3>Every participant, every payer</h3>
              <p>
                Record an expense once, choose who benefited, and split equally, by exact amount, percentage, or
                weighted shares. Residual minor units follow one documented rule.
              </p>
            </article>
            <article className="feature">
              <div className="index">02 / reconcile</div>
              <h3>Balances you can audit</h3>
              <p>
                Corrections keep their before-and-after revision. Voids stay in the history, reversed payments stay
                visible, and active balances are recomputed from the canonical ledger.
              </p>
            </article>
            <article className="feature">
              <div className="index">03 / settle</div>
              <h3>A plan, not a promise</h3>
              <p>
                Debtors and creditors are matched deterministically. The plan shows who should pay whom and why. It is a
                suggestion for records you still have to make in real life.
              </p>
            </article>
            <article className="feature">
              <div className="index">04 / import</div>
              <h3>CSV with a second look</h3>
              <p>
                Map columns, preview normalisation, inspect possible duplicates, and choose how to treat them before a
                single row is committed.
              </p>
            </article>
            <article className="feature">
              <div className="index">05 / budget</div>
              <h3>Thresholds with context</h3>
              <p>
                Set a group budget and category limits. Reports show consumption against those persisted limits, with
                the period and currency visible.
              </p>
            </article>
            <article className="feature">
              <div className="index">06 / account</div>
              <h3>Roles on the server</h3>
              <p>
                Owners manage membership, editors correct transactions, and members read the ledger and record payments
                they send. Permissions are checked on every request.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="honesty">
            <div>
              <p className="eyebrow">Where it stops</p>
              <h2>An honest bound on the product</h2>
            </div>
            <div>
              <ul>
                <li>It does not connect to a bank, card network, or payment provider.</li>
                <li>Recording a reimbursement changes the ledger. It does not move funds.</li>
                <li>The settlement plan uses deterministic greedy matching. It does not claim to minimise transfers for every graph.</li>
                <li>One currency per group. Changing currency after financial records exist is blocked.</li>
                <li>Investment, credit, and financial advice are out of scope.</li>
              </ul>
              <p className="small muted" style={{ marginTop: "1rem" }}>
                Read the <Link href="/privacy">privacy notice</Link> and <Link href="/terms">terms</Link> before using the
                demo with any real names.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section alt">
        <div className="container text-center">
          <p className="eyebrow">Ready when the next bill lands</p>
          <h2>Open a ledger, invite the group, keep the receipts honest.</h2>
          <div className="cluster" style={{ justifyContent: "center", marginTop: "1.4rem" }}>
            <Link href="/signup" className="button">
              Create an account
            </Link>
            <DemoLoginButton className="button secondary" label="Explore demo data" />
          </div>
        </div>
      </section>
    </>
  );
}
