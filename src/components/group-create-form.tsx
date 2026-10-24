"use client";

import Link from "next/link";
import { useState } from "react";
import { CURRENCIES, SUPPORTED_CURRENCY_CODES } from "@/domain/money/currency";
import { apiRequest } from "@/lib/client-api";
import { CopyField } from "./copy-field";

type InviteRow = { email: string; role: "EDITOR" | "MEMBER" };

type Created = {
  groupId: string;
  groupName: string;
  currency: string;
  invites: { email: string; role: string; token: string }[];
};

export function GroupCreateForm({ siteUrl }: { siteUrl: string }) {
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [budget, setBudget] = useState("");
  const [invites, setInvites] = useState<InviteRow[]>([{ email: "", role: "MEMBER" }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  function updateInvite(index: number, patch: Partial<InviteRow>) {
    setInvites((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        name,
        currency,
        budget: budget.trim() || undefined,
        invites: invites.filter((row) => row.email.trim().length > 0 && /@/.test(row.email)),
      };
      const result = await apiRequest<{
        group: { id: string; name: string; currency: string };
        invitations: { email: string; role: string; token: string }[];
      }>("/api/groups", { method: "POST", body: JSON.stringify(payload) });
      setCreated({
        groupId: result.group.id,
        groupName: result.group.name,
        currency: result.group.currency,
        invites: result.invitations,
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The group could not be created.");
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <div className="card">
        <div className="card-header">
          <h2>{created.groupName} is ready</h2>
          <span className="badge active">{created.currency}</span>
        </div>
        <div className="card-body stack">
          <p>
            The group ledger exists. Your owner participant profile was added automatically. No email was sent: copy
            each invitation link to the person directly.
          </p>
          {created.invites.length > 0 ? (
            <div className="stack">
              {created.invites.map((invite) => (
                <div key={invite.token} className="map-card">
                  <p className="small" style={{ marginBottom: "0.45rem" }}>
                    <strong>{invite.email}</strong> · {invite.role.toLowerCase()}
                  </p>
                  <CopyField
                    value={`${siteUrl.replace(/\/$/, "")}/invite/${invite.token}`}
                    label={`Invitation for ${invite.email}`}
                  />
                </div>
              ))}
              <p className="small muted">Invitation links expire after seven days and are shown only once.</p>
            </div>
          ) : null}
          <div className="form-actions">
            <Link href={`/groups/${created.groupId}`} className="button">
              Open the group ledger
            </Link>
            <Link href={`/groups/${created.groupId}/expenses/new`} className="button secondary">
              Add the first expense
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card">
      <div className="card-body stack-lg">
        {error ? <div className="alert" role="alert">{error}</div> : null}
        <div className="grid-2">
          <div className="field">
            <label htmlFor="group-name">Group name</label>
            <input
              id="group-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={80}
              placeholder="Flat 4B household"
            />
            <span className="field-hint">Visible to every member.</span>
          </div>
          <div className="field">
            <label htmlFor="group-currency">Canonical currency</label>
            <select id="group-currency" value={currency} onChange={(event) => setCurrency(event.target.value)}>
              {SUPPORTED_CURRENCY_CODES.map((code) => (
                <option value={code} key={code}>
                  {code} · {CURRENCIES[code].name} ({CURRENCIES[code].precision} decimal places)
                </option>
              ))}
            </select>
            <span className="field-hint">Cannot be changed after financial records exist.</span>
          </div>
          <div className="field">
            <label htmlFor="group-budget">Monthly overall budget (optional)</label>
            <input
              id="group-budget"
              inputMode="decimal"
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
              placeholder="e.g. 45000.00"
            />
            <span className="field-hint">Stored in {currency}. Reports show consumption against it.</span>
          </div>
        </div>

        <fieldset style={{ border: "1px solid var(--line)", borderRadius: "8px", padding: "1rem" }}>
          <legend className="small" style={{ fontWeight: 600, padding: "0 0.4rem" }}>
            Invite people by email (optional)
          </legend>
          <p className="small muted" style={{ marginBottom: "0.8rem" }}>
            Links are generated after creation. No email delivery is configured, so you copy the links yourself.
          </p>
          <div className="stack">
            {invites.map((invite, index) => (
              <div className="split-row" key={index} style={{ gridTemplateColumns: "minmax(0, 1fr) 130px 40px" }}>
                <input
                  type="email"
                  aria-label={`Invite email ${index + 1}`}
                  placeholder="friend@example.com"
                  value={invite.email}
                  onChange={(event) => updateInvite(index, { email: event.target.value })}
                />
                <select
                  aria-label={`Invite role ${index + 1}`}
                  value={invite.role}
                  onChange={(event) => updateInvite(index, { role: event.target.value as "EDITOR" | "MEMBER" })}
                >
                  <option value="MEMBER">Member</option>
                  <option value="EDITOR">Editor</option>
                </select>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove invite ${index + 1}`}
                  onClick={() => setInvites((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}
                  disabled={invites.length === 1}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="button ghost small"
            style={{ marginTop: "0.7rem" }}
            onClick={() => setInvites((rows) => [...rows, { email: "", role: "MEMBER" }])}
            disabled={invites.length >= 20}
          >
            Add another invite
          </button>
        </fieldset>

        <div className="form-actions">
          <button type="submit" className="button" disabled={submitting}>
            {submitting ? "Creating..." : "Create group"}
          </button>
          <Link href="/groups" className="button ghost">Cancel</Link>
        </div>
      </div>
    </form>
  );
}
