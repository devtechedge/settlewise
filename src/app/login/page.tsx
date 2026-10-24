import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loginAction } from "@/auth/actions";
import { getCurrentAuth } from "@/auth/session";
import { safeNextPath } from "@/auth/page-auth";
import { AuthForm } from "@/components/auth-form";
import { DemoLoginButton } from "@/components/demo-login-button";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const auth = await getCurrentAuth();
  const params = await searchParams;
  const next = safeNextPath(params.next);
  if (auth) redirect(next);

  return (
    <div className="auth-shell">
      <div className="auth-grid">
        <aside className="auth-aside">
          <div>
            <p className="eyebrow" style={{ color: "#e3b6a0" }}>Settlewise</p>
            <h2>The ledger remembers, so nobody has to argue from memory.</h2>
            <p>
              Sign in to review balances, correct a transaction with a reason, or record a reimbursement you actually
              made outside this app.
            </p>
          </div>
          <div className="ledger-lines">
            <span>01 · signed amounts, exact minor units</span>
            <span>02 · revision history on every correction</span>
            <span>03 · suggested plans, recorded payments</span>
          </div>
        </aside>
        <section className="auth-card" aria-labelledby="login-title">
          <p className="eyebrow">Welcome back</p>
          <h1 id="login-title">Sign in</h1>
          <p className="lede muted">Use the email you joined with. Sessions are stored as hashed tokens.</p>
          <AuthForm mode="login" action={loginAction} next={next} />
          <div className="divider" />
          <p className="small muted" style={{ marginBottom: "0.7rem" }}>
            Evaluating the product? The demo uses fictional participants and its own data.
          </p>
          <DemoLoginButton className="button secondary" label="Open the demo ledger" />
          <div className="auth-links">
            <span>No account yet?</span>
            <a href={`/signup${next !== "/groups" ? `?next=${encodeURIComponent(next)}` : ""}`}>Create one</a>
          </div>
        </section>
      </div>
    </div>
  );
}
