import Link from "next/link";
import { getCurrentAuth } from "@/auth/session";
import { logoutAction } from "@/auth/actions";
import { BrandMark } from "./brand-mark";
import { ThemeToggle } from "./theme-toggle";

export async function SiteHeader() {
  const auth = await getCurrentAuth();
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href={auth ? "/groups" : "/"} className="wordmark" aria-label="Settlewise home">
          <BrandMark className="wordmark-mark" />
          <span>
            Settlewise
            <small>shared expense ledger</small>
          </span>
        </Link>
        <nav className="site-nav" aria-label="Primary">
          {auth ? (
            <>
              <Link href="/groups">Groups</Link>
              <Link href="/account">Account</Link>
              <form action={logoutAction}>
                <button type="submit" className="link-button">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login">Sign in</Link>
              <Link href="/signup" className="nav-cta">
                Create account
              </Link>
            </>
          )}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
