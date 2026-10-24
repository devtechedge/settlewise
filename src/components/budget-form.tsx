"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { EXPENSE_CATEGORIES, CATEGORY_LABELS } from "@/domain/money/currency";
import { ApiError, apiRequest } from "@/lib/client-api";

export function BudgetForm({ groupId, currency }: { groupId: string; currency: string }) {
  const router = useRouter();
  const [scope, setScope] = useState<"OVERALL" | "CATEGORY">("CATEGORY");
  const [category, setCategory] = useState("GROCERIES");
  const [period, setPeriod] = useState<"MONTHLY" | "ALL_TIME">("MONTHLY");
  const [limit, setLimit] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      await apiRequest(`/api/groups/${groupId}/budgets`, {
        method: "POST",
        body: JSON.stringify({
          scope,
          category: scope === "CATEGORY" ? category : undefined,
          period: scope === "OVERALL" ? "MONTHLY" : period,
          limit,
        }),
      });
      setLimit("");
      setSuccess("Budget saved. Existing reports will use the new limit.");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "The budget could not be saved.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      {error ? <div className="alert" role="alert">{error}</div> : null}
      {success ? <div className="alert success" role="status">{success}</div> : null}
      <div className="form-grid">
        <div className="field">
          <label htmlFor="budget-scope">Budget scope</label>
          <select
            id="budget-scope"
            value={scope}
            onChange={(event) => setScope(event.target.value as "OVERALL" | "CATEGORY")}
          >
            <option value="OVERALL">Overall group budget</option>
            <option value="CATEGORY">Category budget</option>
          </select>
        </div>
        {scope === "CATEGORY" ? (
          <div className="field">
            <label htmlFor="budget-category">Category</label>
            <select id="budget-category" value={category} onChange={(event) => setCategory(event.target.value)}>
              {EXPENSE_CATEGORIES.map((value) => (
                <option key={value} value={value}>{CATEGORY_LABELS[value]}</option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="budget-period">Period</label>
          <select
            id="budget-period"
            value={scope === "OVERALL" ? "MONTHLY" : period}
            onChange={(event) => setPeriod(event.target.value as "MONTHLY" | "ALL_TIME")}
            disabled={scope === "OVERALL"}
          >
            <option value="MONTHLY">Monthly</option>
            <option value="ALL_TIME">All time</option>
          </select>
          {scope === "OVERALL" ? <span className="field-hint">The overall group budget is monthly in this release.</span> : null}
        </div>
        <div className="field">
          <label htmlFor="budget-limit">Limit ({currency})</label>
          <input
            id="budget-limit"
            inputMode="decimal"
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
            required
            placeholder="25000.00"
          />
        </div>
      </div>
      <div className="form-actions">
        <button type="submit" className="button secondary" disabled={submitting}>
          {submitting ? "Saving..." : "Save budget"}
        </button>
        <span className="small muted">A new limit replaces the existing one for the same scope and period.</span>
      </div>
    </form>
  );
}
