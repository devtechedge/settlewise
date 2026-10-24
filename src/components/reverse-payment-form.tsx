"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, apiRequest } from "@/lib/client-api";

export function ReversePaymentForm({ paymentId, label }: { paymentId: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiRequest(`/api/settlements/payments/${paymentId}/reverse`, {
        method: "POST",
        body: JSON.stringify({ reason, idempotencyKey }),
      });
      setOpen(false);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "The payment could not be reversed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="button ghost small" onClick={() => setOpen(true)} aria-label={`Reverse payment ${label}`}>
        Reverse
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="stack" style={{ minWidth: "260px" }}>
      {error ? <div className="alert" role="alert">{error}</div> : null}
      <div className="field">
        <label htmlFor={`reverse-reason-${paymentId}`}>Reversal reason</label>
        <input
          id={`reverse-reason-${paymentId}`}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={3}
          maxLength={300}
          required
          placeholder="Payment was entered twice"
          autoFocus
        />
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Creates a linked compensating record. The original and the reversal stay in history; effective balances are
        restored.
      </p>
      <div className="form-actions">
        <button type="submit" className="button danger small" disabled={submitting}>
          {submitting ? "Reversing..." : "Confirm reversal"}
        </button>
        <button type="button" className="button ghost small" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
