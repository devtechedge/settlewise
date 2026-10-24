import Link from "next/link";

export default function NotFound() {
  return (
    <div className="narrow" style={{ paddingTop: "4rem" }}>
      <div className="card">
        <div className="card-body stack">
          <p className="eyebrow">404 · not in this ledger</p>
          <h1>That page is not here</h1>
          <p className="muted">
            The link may be old, the record may belong to a group you cannot access, or the page may have moved.
          </p>
          <div className="form-actions">
            <Link href="/groups" className="button">
              Go to groups
            </Link>
            <Link href="/" className="button secondary">
              Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
