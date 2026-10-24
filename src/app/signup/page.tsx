import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signupAction } from "@/auth/actions";
import { getCurrentAuth } from "@/auth/session";
import { safeNextPath } from "@/auth/page-auth";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const auth = await getCurrentAuth();
  const params = await searchParams;
  const next = safeNextPath(params.next);
  if (auth) redirect(next);

  return (
    <div className="auth-shell">
      <div className="auth-grid">
        <aside className="auth-aside">
          <div>
            <p className="eyebrow" style={{ color: "#e3b6a0" }}>New ledger</p>
            <h2>Start with a group, a currency, and the people who share the cost.</h2>
            <p>
              Invite by email, or add participants who do not need an account. You can record their expenses and
              reimburse them without inventing fake logins.
            </p>
          </div>
          <div className="ledger-lines">
            <span>owner · membership, currency, deletion</span>
            <span>editor · transactions and imports</span>
            <span>member · read access and own payments</span>
          </div>
        </aside>
        <section className="auth-card" aria-labelledby="signup-title">
          <p className="eyebrow">Get started</p>
          <h1 id="signup-title">Create your account</h1>
          <p className="lede muted">A real account, a real session, and a group you control.</p>
          <AuthForm mode="signup" action={signupAction} next={next} />
        </section>
      </div>
    </div>
  );
}
