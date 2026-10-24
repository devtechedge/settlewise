"use client";

import { useState } from "react";

export function CopyField({ value, label = "Invitation link" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    setError(null);
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Copy failed. Select the link and copy it manually.");
    }
  }

  return (
    <div className="stack" style={{ gap: "0.3rem" }}>
      <label className="visually-hidden" htmlFor={`copy-${label.replace(/\s+/g, "-")}`}>
        {label}
      </label>
      <div className="copy-row">
        <input id={`copy-${label.replace(/\s+/g, "-")}`} value={value} readOnly onFocus={(event) => event.currentTarget.select()} />
        <button type="button" className="button secondary small" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {error ? <span className="field-error" role="alert">{error}</span> : null}
    </div>
  );
}
