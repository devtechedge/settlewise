"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { getCurrency } from "@/domain/money/currency";
import { formatMinor, minorToPlainString } from "@/domain/money/money";
import { ApiError, apiRequest } from "@/lib/client-api";

type Party = { id: string; name: string; netMinor: bigint };
type Suggestion = { fromId: string; toId: string; amountMinor: bigint; fromName: string; toName: string };

export function PaymentForm({
  groupId,
  currency,
  debtors,
  creditors,
  suggestions,
  memberParticipantId,
  isMember,
}: {
  groupId: string;
  currency: string;
  debtors: Party[];
  creditors: Party[];
  suggestions: Suggestion[];
  memberParticipantId: string | null;
  isMember: boolean;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const availableSuggestions = isMember
    ? suggestions.filter((suggestion) => suggestion.fromId === memberParticipantId)
    : suggestions;
  const initialSuggestion = availableSuggestions[0];
  const [senderId, setSenderId] = useState(initialSuggestion?.fromId ?? (isMember ? memberParticipantId ?? "" : debtors[0]?.id ?? ""));
  const [recipientId, setRecipientId] = useState(initialSuggestion?.toId ?? creditors[0]?.id ?? "");
  const currencyInfo = getCurrency(currency);
  const [amount, setAmount] = useState(
    initialSuggestion ? minorToPlainString(initialSuggestion.amountMinor, currencyInfo) : "",
  );
  const [paidOn, setPaidOn] = useState(today);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  const sender = debtors.find((party) => party.id === senderId);
  const recipient = creditors.find((party) => party.id === recipientId);
  const outstanding =
    sender && recipient
      ? (() => {
          const owed = -sender.netMinor;
          const due = recipient.netMinor;
          return owed < due ? owed : due;
        })()
      : null;

  function applySuggestion(index: number) {
    const suggestion = availableSuggestions[index];
    if (!suggestion) return;
    setSenderId(suggestion.fromId);
    setRecipientId(suggestion.toId);
    setAmount(minorToPlainString(suggestion.amountMinor, currencyInfo));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      await apiRequest(`/api/groups/${groupId}/settlements/payments`, {
        method: "POST",
        body: JSON.stringify({
          senderParticipantId: senderId,
          recipientParticipantId: recipientId,
          amount,
          paidOn,
          notes: notes || undefined,
          idempotencyKey: idempotencyKey.current,
        }),
      });
      setSuccess(`Payment of ${amount} ${currency} recorded. It changed records, not real money.`);
      setAmount("");
      setNotes("");
      idempotencyKey.current = crypto.randomUUID();
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "The payment could not be recorded.");
    } finally {
      setSubmitting(false);
    }
  }

  if (isMember && !memberParticipantId) {
    return (
      <p className="notice">
        Your account is not linked to a participant in this group, so you cannot record a payment as its sender. Ask the
        owner to link your profile.
      </p>
    );
  }

  if (debtors.length === 0 || creditors.length === 0) {
    return <p className="muted small">No payment can be recorded while either side of the ledger is empty.</p>;
  }

  return (
    <form onSubmit={submit} className="stack">
      {error ? <div className="alert" role="alert">{error}</div> : null}
      {success ? <div className="alert success" role="status">{success}</div> : null}

      {availableSuggestions.length > 0 ? (
        <div className="field">
          <label htmlFor="payment-suggestion">Start from a suggested transfer</label>
          <select
            id="payment-suggestion"
            defaultValue=""
            onChange={(event) => {
              if (event.target.value !== "") applySuggestion(Number(event.target.value));
            }}
          >
            <option value="">Choose manually</option>
            {availableSuggestions.map((suggestion, index) => (
              <option key={`${suggestion.fromId}-${suggestion.toId}-${suggestion.amountMinor}`} value={index}>
                {suggestion.fromName} pays {suggestion.toName} · {formatMinor(suggestion.amountMinor, currency)}
              </option>
            ))}
          </select>
          <span className="field-hint">Suggestions fill the fields. You can record a partial amount or another debtor-creditor pair.</span>
        </div>
      ) : null}

      <div className="form-grid">
        <div className="field">
          <label htmlFor="payment-sender">Sender (payer)</label>
          <select
            id="payment-sender"
            value={senderId}
            onChange={(event) => setSenderId(event.target.value)}
            disabled={isMember}
            required
          >
            {debtors.map((party) => (
              <option value={party.id} key={party.id}>
                {party.name} · owes {formatMinor(-party.netMinor, currency)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="payment-recipient">Recipient</label>
          <select
            id="payment-recipient"
            value={recipientId}
            onChange={(event) => setRecipientId(event.target.value)}
            required
          >
            {creditors.map((party) => (
              <option value={party.id} key={party.id}>
                {party.name} · is owed {formatMinor(party.netMinor, currency)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="payment-amount">Amount ({currency})</label>
          <input
            id="payment-amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
            placeholder="0.00"
          />
          <span className="field-hint">
            {outstanding !== null ? `Maximum supported by both balances: ${formatMinor(outstanding, currency)}.` : "Choose both parties."}
          </span>
        </div>
        <div className="field">
          <label htmlFor="payment-date">Date you paid</label>
          <input
            id="payment-date"
            type="date"
            value={paidOn}
            max={today}
            min="2000-01-01"
            onChange={(event) => setPaidOn(event.target.value)}
            required
          />
        </div>
        <div className="field span-2">
          <label htmlFor="payment-notes">Notes (optional)</label>
          <input
            id="payment-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={500}
            placeholder="UPI reference, cash, bank transfer you already made..."
          />
        </div>
      </div>

      <div className="form-actions">
        <button type="submit" className="button" disabled={submitting || !senderId || !recipientId || !amount}>
          {submitting ? "Recording..." : "Record payment"}
        </button>
        <span className="small muted">Records money that already changed hands. It does not initiate a transfer.</span>
      </div>
    </form>
  );
}
