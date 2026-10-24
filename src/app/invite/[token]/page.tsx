import type { Metadata } from "next";
import Link from "next/link";
import { acceptInviteAction } from "@/auth/actions";
import { previewInvitation } from "@/auth/invitations";
import { getCurrentAuth } from "@/auth/session";
import { AppError } from "@/lib/errors";

export const metadata: Metadata = { title: "Group invitation", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error: queryError } = await searchParams;
  const auth = await getCurrentAuth();

  let invitation;
  try {
    invitation = await previewInvitation(token);
  } catch (error) {
    const message = error instanceof AppError ? error.message : "This invitation could not be loaded.";
    return (
      <div className="narrow" style={{ paddingTop: "4rem" }}>
        <div className="card">
          <div className="card-body stack">
            <p className="eyebrow">Invitation</p>
            <h1>Link unavailable</h1>
            <p className="muted">{message}</p>
            <p className="small">Ask the group owner for a fresh invitation. Links expire after seven days.</p>
            <Link href={auth ? "/groups" : "/login"} className="button">
              {auth ? "Go to your groups" : "Sign in"}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const canAccept = auth && auth.user.email.toLowerCase() === invitation.email.toLowerCase();
  const wrongAccount = auth && !canAccept;

  return (
    <div className="auth-shell">
      <div className="auth-grid">
        <aside className="auth-aside">
          <div>
            <p className="eyebrow" style={{ color: "#e3b6a0" }}>{invitation.inviterName} invited you</p>
            <h2>{invitation.groupName}</h2>
            <p>
              Joining gives you a {invitation.role.toLowerCase()} role. You will see the shared ledger and settlement
              plan. The invitation is tied to {invitation.email}.
            </p>
          </div>
          <div className="ledger-lines">
            <span>expires · {invitation.expiresAt.toISOString().slice(0, 10)}</span>
            <span>role · {invitation.role}</span>
            <span>group · one canonical currency</span>
          </div>
        </aside>
        <section className="auth-card">
          <p className="eyebrow">Accept invitation</p>
          <h1>Join {invitation.groupName}</h1>
          {invitation.isExpired ? (
            <div className="alert" role="alert">
              This invitation has expired. Ask the owner to send a new link.
            </div>
          ) : invitation.isAccepted ? (
            <div className="notice">This invitation has already been accepted. Sign in to open the group.</div>
          ) : null}
          {queryError ? (
            <div className="alert" role="alert" style={{ marginBottom: "1rem" }}>
              {queryError}
            </div>
          ) : null}

          {!auth ? (
            <>
              <p className="lede muted">
                Sign in with {invitation.email} to accept. If you do not have an account, create one with this address.
              </p>
              <div className="form-actions">
                <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className="button">
                  Sign in
                </Link>
                <Link href={`/signup?next=${encodeURIComponent(`/invite/${token}`)}`} className="button secondary">
                  Create account
                </Link>
              </div>
            </>
          ) : wrongAccount ? (
            <>
              <div className="alert" role="alert">
                You are signed in as {auth.user.email}. This invitation belongs to {invitation.email}.
              </div>
              <p className="small muted">Sign in with the invited address, or ask the owner for a new invitation.</p>
            </>
          ) : invitation.isExpired || invitation.isAccepted ? null : (
            <form action={acceptInviteAction.bind(null, token)}>
              <p className="muted small">
                Signed in as {auth?.user.email}. Accepting adds a membership and links your participant profile for this
                group.
              </p>
              <button type="submit" className="button">
                Accept and open group
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
