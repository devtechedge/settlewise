"use client";

import Link from "next/link";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="narrow" style={{ paddingTop: "4rem" }}>
      <div className="card">
        <div className="card-body stack">
          <p className="eyebrow">Recoverable failure</p>
          <h1>This page could not finish loading</h1>
          <p className="muted">
            Your saved records were not changed by this error. Try again. If it keeps happening, open an issue and
            include the time, the page you were on, and the reference below. Do not include passwords or full
            financial details.
          </p>
          {error.digest ? (
            <p className="small muted">
              Reference: <span className="mono">{error.digest}</span>
            </p>
          ) : null}
          <div className="form-actions">
            <button type="button" className="button" onClick={reset}>
              Try again
            </button>
            <Link href="/groups" className="button secondary">
              Go to groups
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
