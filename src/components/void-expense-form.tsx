"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, apiRequest } from "@/lib/client-api";

export function VoidExpenseForm({ expenseId, revision }: { expenseId: string; revision: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiRequest(`/api/expenses/${expenseId}/void`, {
        method: "POST",
        body: JSON.stringify({ expectedRevision: revision, reason }),
      });
      setOpen(false);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "The expense could not be voided.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="button danger small" onClick={() => setOpen(true)}>
        Void this expense
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="card" style={{ padding: "1rem", borderColor: "var(--danger)" }}>
      <div className="stack">
        <p className="small" style={{ margin: 0 }}>
          Voiding keeps the record and its revisions in history, but removes its effect from balances and settlement
          plans. This cannot be undone by editing; record a new expense instead.
        </p>
        {error ? <div className="alert" role="alert">{error}</div> : null}
        <div className="field">
          <label htmlFor="void-reason">Reason</label>
          <input
            id="void-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={3}
            maxLength={300}
            required
            placeholder="Duplicate entry; the real purchase is recorded separately"
          />
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          <span>I understand this will be excluded from effective balances.</span>
        </label>
        <div className="form-actions">
          <button type="submit" className="button danger" disabled={!confirmed || submitting}>
            {submitting ? "Voiding..." : "Void expense"}
          </button>
          <button type="button" className="button ghost" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </div>
    </form>
  );
}
