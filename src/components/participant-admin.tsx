"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, apiRequest } from "@/lib/client-api";

export function AddParticipantForm({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiRequest(`/api/groups/${groupId}/participants`, {
        method: "POST",
        body: JSON.stringify({ displayName: name }),
      });
      setName("");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "The participant could not be added.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack" style={{ marginTop: "1rem" }}>
      {error ? <div className="alert" role="alert">{error}</div> : null}
      <div className="field">
        <label htmlFor="participant-name">Add a participant without an account</label>
        <div className="cluster" style={{ flexWrap: "nowrap" }}>
          <input
            id="participant-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={60}
            placeholder="Ravi"
            style={{ flex: 1 }}
          />
          <button type="submit" className="button secondary" disabled={submitting}>
            {submitting ? "Adding..." : "Add"}
          </button>
        </div>
        <span className="field-hint">Useful for family members or friends who will not sign in. You can invite the same name to an account later.</span>
      </div>
    </form>
  );
}

export function ParticipantStatusButton({
  groupId,
  participantId,
  displayName,
  status,
}: {
  groupId: string;
  participantId: string;
  displayName: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextStatus = status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/api/groups/${groupId}/participants/${participantId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "The participant could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-stack">
      <button type="button" className="button ghost small" onClick={toggle} disabled={busy} aria-label={`${nextStatus === "ACTIVE" ? "Reactivate" : "Deactivate"} ${displayName}`}>
        {busy ? "..." : nextStatus === "ACTIVE" ? "Reactivate" : "Deactivate"}
      </button>
      {error ? <span className="field-error" role="alert">{error}</span> : null}
    </span>
  );
}

export function InviteMemberForm({
  groupId,
  siteUrl,
  pendingInvites,
}: {
  groupId: string;
  siteUrl: string;
  pendingInvites: { id: string; email: string; role: string; expiresAt: string }[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"MEMBER" | "EDITOR">("MEMBER");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; role: string; token: string; expiresAt: string } | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await apiRequest<{ token: string; expiresAt: string }>(`/api/groups/${groupId}/invitations`, {
        method: "POST",
        body: JSON.stringify({ email, role }),
      });
      setCreated({ email, role, token: result.token, expiresAt: result.expiresAt });
      setEmail("");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "The invitation could not be created.");
    } finally {
      setSubmitting(false);
    }
  }

  async function revoke(invitationId: string) {
    setRevoking(invitationId);
    setError(null);
    try {
      await apiRequest(`/api/groups/${groupId}/invitations/${invitationId}`, { method: "DELETE" });
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "The invitation could not be revoked.");
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className="stack">
      {error ? <div className="alert" role="alert">{error}</div> : null}
      <form onSubmit={submit} className="stack">
        <div className="form-grid">
          <div className="field">
            <label htmlFor="invite-email">Email</label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              maxLength={254}
              placeholder="friend@example.com"
            />
          </div>
          <div className="field">
            <label htmlFor="invite-role">Role</label>
            <select id="invite-role" value={role} onChange={(event) => setRole(event.target.value as "MEMBER" | "EDITOR")}>
              <option value="MEMBER">Member · read and record own payments</option>
              <option value="EDITOR">Editor · add and correct transactions</option>
            </select>
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="button" disabled={submitting}>
            {submitting ? "Creating link..." : "Create invitation link"}
          </button>
          <span className="small muted">Links expire after seven days. No email is sent.</span>
        </div>
      </form>

      {created ? (
        <div className="map-card">
          <p className="small" style={{ marginBottom: "0.4rem" }}>
            New {created.role.toLowerCase()} link for <strong>{created.email}</strong>. Shown once; expires{" "}
            {created.expiresAt.slice(0, 10)}.
          </p>
          <div className="copy-row">
            <input readOnly value={`${siteUrl.replace(/\/$/, "")}/invite/${created.token}`} onFocus={(event) => event.currentTarget.select()} />
            <button
              type="button"
              className="button secondary small"
              onClick={() => {
                void navigator.clipboard.writeText(`${siteUrl.replace(/\/$/, "")}/invite/${created.token}`);
              }}
            >
              Copy
            </button>
          </div>
        </div>
      ) : null}

      {pendingInvites.length > 0 ? (
        <div>
          <h3>Pending invitations</h3>
          <div className="table-wrap">
            <table className="ledger">
              <thead>
                <tr>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Expires</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingInvites.map((invite) => (
                  <tr key={invite.id}>
                    <td>{invite.email}</td>
                    <td>{invite.role.toLowerCase()}</td>
                    <td className="mono small">{invite.expiresAt.slice(0, 10)}</td>
                    <td>
                      <button
                        type="button"
                        className="button ghost small"
                        onClick={() => void revoke(invite.id)}
                        disabled={revoking === invite.id}
                      >
                        {revoking === invite.id ? "Revoking..." : "Revoke"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="small muted">No pending invitations.</p>
      )}
    </div>
  );
}
