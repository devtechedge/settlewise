"use client";

import { useMemo, useState } from "react";
import { allocateSplit } from "@/domain/expenses/allocation";
import { formatMinor, parseMoneyToMinor } from "@/domain/money/money";

const PEOPLE = ["Maya", "Arjun", "Leela"];

export function IllustrativeSplit() {
  const [amount, setAmount] = useState("3000");

  const preview = useMemo(() => {
    try {
      const minor = parseMoneyToMinor(amount, "INR");
      if (minor <= 0n) return { error: "Enter an amount greater than zero." as string };
      const result = allocateSplit(minor, { method: "EQUAL", participantIds: ["p-a", "p-b", "p-c"] });
      return { result };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Enter a valid amount." };
    }
  }, [amount]);

  return (
    <div className="preview-panel">
      <div className="field">
        <label htmlFor="illustrative-amount">Try an equal split (INR)</label>
        <input
          id="illustrative-amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          aria-describedby="illustrative-note"
        />
      </div>
      {preview.error ? (
        <p className="field-error" role="alert" style={{ marginTop: "0.6rem" }}>
          {preview.error}
        </p>
      ) : null}
      {preview.result ? (
        <div aria-live="polite">
          {preview.result.allocations.map((row, index) => (
            <div className="preview-row" key={row.participantId}>
              <span>{PEOPLE[index]}</span>
              <strong>{formatMinor(row.amountMinor, "INR")}</strong>
            </div>
          ))}
          <p className="footnote" id="illustrative-note">
            Illustrative only. {preview.result.residualMinor > 0n
              ? `${preview.result.residualMinor} residual paisa assigned by participant order.`
              : "This total divides evenly."}{" "}
            Nothing is saved.
          </p>
        </div>
      ) : null}
    </div>
  );
}
