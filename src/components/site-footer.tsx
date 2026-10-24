import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div>
          <p className="footer-brand">Settlewise</p>
          <p className="footer-note">
            A record-keeping and settlement-planning tool. It does not move money, connect to banks, or provide financial advice.
          </p>
        </div>
        <nav aria-label="Legal">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <a href="https://github.com/devtechedge/settlewise" rel="noreferrer">
            Source
          </a>
        </nav>
      </div>
    </footer>
  );
}
