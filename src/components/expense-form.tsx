"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { allocateSplit, type SplitInput } from "@/domain/expenses/allocation";
import { EXPENSE_CATEGORIES, CATEGORY_LABELS, getCurrency } from "@/domain/money/currency";
import { formatMinor, minorToPlainString, parseMoneyToMinor, parsePercentToBasisPoints } from "@/domain/money/money";
import { ApiError, apiRequest } from "@/lib/client-api";

type ParticipantOption = { id: string; displayName: string; status: string };
type Method = "EQUAL" | "PERCENT" | "SHARES" | "EXACT";
type EntryValues = { amount: string; percent: string; shares: string };
type InitialEntry = EntryValues & { id: string };

export type ExpenseInitial = {
  description: string;
  amount: string;
  category: string;
  occurredOn: string;
  payerParticipantId: string;
  notes: string;
  method: Method;
  entries: InitialEntry[];
  revision: number;
};

const METHOD_LABELS: Record<Method, string> = {
  EQUAL: "Equal",
  EXACT: "Exact amounts",
  PERCENT: "Percentages",
  SHARES: "Shares",
};

const METHOD_HELP: Record<Method, string> = {
  EQUAL: "The total is divided as evenly as the currency allows. Any residual minor units go to the first beneficiaries by participant ID.",
  EXACT: "Enter each person's share directly. The shares must add up to the expense total exactly.",
  PERCENT: "Enter percentages; the server stores integer basis points. Residual minor units use the largest-remainder rule, with participant ID as the tie-breaker.",
  SHARES: "Enter positive integer weights. Each share is total times weight divided by total weight, with largest-remainder rounding.",
};

function defaultsFor(method: Method): EntryValues {
  if (method === "SHARES") return { amount: "0.00", percent: "0.00", shares: "1" };
  return { amount: "0.00", percent: "0.00", shares: "1" };
}

function percentString(basisPoints: number): string {
  return (basisPoints / 100).toFixed(2);
}

export function ExpenseForm({
  groupId,
  currency,
  participants,
  mode,
  expenseId,
  initial,
  defaultPayerId,
}: {
  groupId: string;
  currency: string;
  participants: ParticipantOption[];
  mode: "create" | "edit";
  expenseId?: string;
  initial?: ExpenseInitial;
  defaultPayerId: string;
}) {
  const router = useRouter();
  const currencyInfo = getCurrency(currency);
  const today = new Date().toISOString().slice(0, 10);
  const activeParticipants = participants.filter((participant) => participant.status === "ACTIVE");

  const startSelected = initial
    ? new Set(initial.entries.map((entry) => entry.id))
    : new Set(activeParticipants.map((participant) => participant.id));

  const [description, setDescription] = useState(initial?.description ?? "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [category, setCategory] = useState(initial?.category ?? "DINING");
  const [occurredOn, setOccurredOn] = useState(initial?.occurredOn ?? today);
  const [payerId, setPayerId] = useState(initial?.payerParticipantId ?? defaultPayerId);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [method, setMethod] = useState<Method>(initial?.method ?? "EQUAL");
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<Set<string>>(startSelected);
  const [entries, setEntries] = useState<Record<string, EntryValues>>(() => {
    const map: Record<string, EntryValues> = {};
    if (initial) {
      for (const entry of initial.entries) map[entry.id] = { amount: entry.amount, percent: entry.percent, shares: entry.shares };
    } else {
      for (const participant of activeParticipants) map[participant.id] = defaultsFor("EQUAL");
    }
    return map;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<unknown>(null);

  function ensureEntry(participantId: string, nextMethod = method) {
    setEntries((current) => {
      if (current[participantId]) return current;
      return { ...current, [participantId]: defaultsFor(nextMethod) };
    });
  }

  function toggleParticipant(participantId: string) {
    const willSelect = !selected.has(participantId);
    if (willSelect) ensureEntry(participantId);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(participantId)) next.delete(participantId);
      else next.add(participantId);
      return next;
    });
  }

  function setEntry(participantId: string, field: keyof EntryValues, value: string) {
    setEntries((current) => ({
      ...current,
      [participantId]: { ...(current[participantId] ?? defaultsFor(method)), [field]: value },
    }));
  }

  function chooseMethod(nextMethod: Method) {
    setMethod(nextMethod);
    const ids = [...selected];
    if (nextMethod === "PERCENT") {
      const total = 10000;
      const base = Math.floor(total / Math.max(ids.length, 1));
      const remainder = total - base * ids.length;
      setEntries((current) => {
        const next = { ...current };
        ids.forEach((id, index) => {
          const existing = next[id] ?? defaultsFor(nextMethod);
          if (!existing.percent || existing.percent === "0.00") {
            next[id] = { ...existing, percent: percentString(base + (index < remainder ? 1 : 0)) };
          }
        });
        return next;
      });
    }
  }

  const preview = useMemo(() => {
    try {
      const minor = parseMoneyToMinor(amount, currency);
      if (minor <= 0n) return { error: "Enter an amount greater than zero." };
      const ids = [...selected];
      if (ids.length === 0) return { error: "Select at least one beneficiary." };
      let input: SplitInput;
      if (method === "EQUAL") {
        input = { method: "EQUAL", participantIds: ids };
      } else if (method === "EXACT") {
        input = {
          method: "EXACT",
          entries: ids.map((id) => ({
            participantId: id,
            amountMinor: parseMoneyToMinor(entries[id]?.amount ?? "0", currency),
          })),
        };
      } else if (method === "PERCENT") {
        input = {
          method: "PERCENT",
          entries: ids.map((id) => ({
            participantId: id,
            basisPoints: parsePercentToBasisPoints(entries[id]?.percent ?? "0"),
          })),
        };
      } else {
        input = {
          method: "SHARES",
          entries: ids.map((id) => ({
            participantId: id,
            shares: Number.parseInt(entries[id]?.shares ?? "1", 10) || 0,
          })),
        };
      }
      return { result: allocateSplit(minor, input), minor };
    } catch (previewError) {
      return { error: previewError instanceof Error ? previewError.message : "The split is not valid yet." };
    }
  }, [amount, currency, entries, method, selected]);

  const nameById = new Map(participants.map((participant) => [participant.id, participant.displayName]));
  const computedById = new Map(
    preview.result?.allocations.map((allocation) => [allocation.participantId, allocation.amountMinor]) ?? [],
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setErrorDetails(null);
    if (preview.error) {
      setError(preview.error);
      return;
    }
    if (!preview.result) return;
    setSubmitting(true);
    try {
      const ids = [...selected];
      const split =
        method === "EQUAL"
          ? { method, participantIds: ids }
          : method === "EXACT"
            ? { method, entries: ids.map((id) => ({ participantId: id, amount: entries[id]?.amount ?? "0" })) }
            : method === "PERCENT"
              ? { method, entries: ids.map((id) => ({ participantId: id, percent: entries[id]?.percent ?? "0" })) }
              : {
                  method,
                  entries: ids.map((id) => ({
                    participantId: id,
                    shares: Number.parseInt(entries[id]?.shares ?? "0", 10) || 0,
                  })),
                };
      const payload = {
        description,
        category,
        occurredOn,
        payerParticipantId: payerId,
        amount,
        notes: notes || undefined,
        split,
        ...(mode === "edit" ? { expectedRevision: initial?.revision, reason } : {}),
      };
      if (mode === "edit" && expenseId) {
        await apiRequest(`/api/expenses/${expenseId}`, { method: "PATCH", body: JSON.stringify(payload) });
        router.push(`/groups/${groupId}/expenses/${expenseId}?updated=1`);
      } else {
        const result = await apiRequest<{ expenseId: string }>(`/api/groups/${groupId}/expenses`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        router.push(`/groups/${groupId}/expenses/${result.expenseId}?created=1`);
      }
      router.refresh();
    } catch (requestError) {
      if (requestError instanceof ApiError) {
        setError(requestError.message);
        setErrorDetails(requestError.details);
      } else {
        setError("The expense could not be saved.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="card" noValidate>
      <div className="card-body stack-lg">
        {error ? (
          <div className="alert" role="alert">
            <strong>{error}</strong>
            {errorDetails ? (
              <pre className="small" style={{ whiteSpace: "pre-wrap", margin: "0.45rem 0 0" }}>
                {JSON.stringify(errorDetails, null, 2)}
              </pre>
            ) : null}
          </div>
        ) : null}

        <div className="form-grid">
          <div className="field span-2">
            <label htmlFor="expense-description">Description</label>
            <input
              id="expense-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              required
              maxLength={120}
              placeholder="Saturday groceries"
            />
            <span className="field-hint">What the shared cost was for. Avoid sensitive personal details.</span>
          </div>
          <div className="field">
            <label htmlFor="expense-amount">Amount ({currency})</label>
            <input
              id="expense-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
              placeholder={currencyInfo.precision === 0 ? "1200" : "1200.00"}
            />
            <span className="field-hint">
              Up to {currencyInfo.precision} decimal place{currencyInfo.precision === 1 ? "" : "s"}. Stored in minor units,
              never floating point.
            </span>
          </div>
          <div className="field">
            <label htmlFor="expense-date">Date</label>
            <input
              id="expense-date"
              type="date"
              value={occurredOn}
              max={today}
              min="2000-01-01"
              onChange={(event) => setOccurredOn(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="expense-category">Category</label>
            <select id="expense-category" value={category} onChange={(event) => setCategory(event.target.value)}>
              {EXPENSE_CATEGORIES.map((value) => (
                <option value={value} key={value}>
                  {CATEGORY_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="expense-payer">Who paid?</label>
            <select id="expense-payer" value={payerId} onChange={(event) => setPayerId(event.target.value)} required>
              {participants.map((participant) => (
                <option value={participant.id} key={participant.id} disabled={mode === "create" && participant.status !== "ACTIVE"}>
                  {participant.displayName}
                  {participant.status !== "ACTIVE" ? " (inactive)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="field span-2">
            <label htmlFor="expense-notes">Notes (optional)</label>
            <textarea
              id="expense-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={500}
              placeholder="Receipt reference, context, or nothing at all."
            />
          </div>
        </div>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label" style={{ fontWeight: 600, marginBottom: "0.6rem" }}>
            Split method
          </legend>
          <div className="method-tabs" role="group" aria-label="Split method">
            {(Object.keys(METHOD_LABELS) as Method[]).map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={method === value}
                onClick={() => chooseMethod(value)}
              >
                {METHOD_LABELS[value]}
              </button>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: "0.6rem" }}>{METHOD_HELP[method]}</p>
        </fieldset>

        <div className="split-editor">
          <div className="split-rows">
            {participants.map((participant) => {
              const isSelected = selected.has(participant.id);
              const entry = entries[participant.id];
              const computed = computedById.get(participant.id);
              return (
                <div className={`split-row ${isSelected ? "" : "inactive"}`} key={participant.id}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleParticipant(participant.id)}
                    aria-label={`Include ${participant.displayName} in this expense`}
                    style={{ width: 18, height: 18, accentColor: "var(--forest)" }}
                  />
                  <span className="who">
                    {participant.displayName}
                    <small>{participant.status === "ACTIVE" ? "beneficiary" : "inactive participant"}</small>
                  </span>
                  {method === "EXACT" ? (
                    <input
                      type="text"
                      inputMode="decimal"
                      value={entry?.amount ?? "0.00"}
                      onChange={(event) => setEntry(participant.id, "amount", event.target.value)}
                      disabled={!isSelected}
                      aria-label={`Exact amount for ${participant.displayName}`}
                    />
                  ) : method === "PERCENT" ? (
                    <input
                      type="text"
                      inputMode="decimal"
                      value={entry?.percent ?? "0.00"}
                      onChange={(event) => setEntry(participant.id, "percent", event.target.value)}
                      disabled={!isSelected}
                      aria-label={`Percentage for ${participant.displayName}`}
                    />
                  ) : method === "SHARES" ? (
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={entry?.shares ?? "1"}
                      onChange={(event) => setEntry(participant.id, "shares", event.target.value)}
                      disabled={!isSelected}
                      aria-label={`Shares for ${participant.displayName}`}
                    />
                  ) : (
                    <span className="small muted">equal share</span>
                  )}
                  <span className="computed">
                    {isSelected && computed !== undefined ? formatMinor(computed, currency) : isSelected ? "—" : "not included"}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="split-preview" aria-live="polite">
            <div className="head">
              <span>Allocation preview</span>
              <span>{preview.result ? `${formatMinor(preview.result.totalMinor, currency)} total` : "waiting for a valid total"}</span>
            </div>
            {preview.error ? (
              <p className="field-error" role="status">{preview.error}</p>
            ) : preview.result ? (
              <>
                {preview.result.allocations.map((allocation) => (
                  <div className="preview-row" key={allocation.participantId}>
                    <span>{nameById.get(allocation.participantId) ?? "Participant"}</span>
                    <span>{formatMinor(allocation.amountMinor, currency)}</span>
                  </div>
                ))}
                <p className="rule-note">
                  {preview.result.residualMinor > 0n
                    ? `${preview.result.residualMinor} residual minor unit${preview.result.residualMinor === 1n ? "" : "s"} assigned to: ${preview.result.residualRecipients
                        .map((id) => nameById.get(id) ?? id)
                        .join(", ")}.`
                    : "No residual minor units for this split."}{" "}
                  The server recomputes this allocation before saving.
                </p>
              </>
            ) : null}
          </div>
        </div>

        {mode === "edit" ? (
          <div className="field">
            <label htmlFor="expense-reason">Reason for this correction</label>
            <input
              id="expense-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              minLength={3}
              maxLength={300}
              placeholder="Corrected the payer after checking the receipt"
            />
            <span className="field-hint">Saved in the immutable revision history and audit log.</span>
          </div>
        ) : null}

        <div className="form-actions">
          <button type="submit" className="button" disabled={submitting || Boolean(preview.error)}>
            {submitting ? "Saving..." : mode === "edit" ? "Save correction" : "Record expense"}
          </button>
          <Link
            href={mode === "edit" && expenseId ? `/groups/${groupId}/expenses/${expenseId}` : `/groups/${groupId}/expenses`}
            className="button ghost"
          >
            Cancel
          </Link>
          <span className="small muted">Minor units: {preview.minor ? minorToPlainString(preview.minor, currencyInfo) : "—"} {currency}</span>
        </div>
      </div>
    </form>
  );
}
