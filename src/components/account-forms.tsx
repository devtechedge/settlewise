"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, apiRequest } from "@/lib/client-api";

export function ProfileForm({ initialName, email }: { initialName: string; email: string }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      await apiRequest("/api/account/profile", {
        method: "PATCH",
        body: JSON.stringify({ displayName }),
      });
      setSuccess("Profile name updated. Linked participant names were updated in your groups.");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "The profile could not be updated.");
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
          <label htmlFor="profile-name">Display name</label>
          <input id="profile-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required maxLength={60} />
          <span className="field-hint">Shown on memberships, audit events, and your participant profile.</span>
        </div>
        <div className="field">
          <label htmlFor="profile-email">Email</label>
          <input id="profile-email" value={email} readOnly />
          <span className="field-hint">Email changes are not supported in this release.</span>
        </div>
      </div>
      <div className="form-actions">
        <button type="submit" className="button secondary" disabled={submitting}>
          {submitting ? "Saving..." : "Save profile"}
        </button>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const result = await apiRequest<{ note?: string }>("/api/account/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setSuccess(result.note ?? "Password updated. Other sessions were revoked.");
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "The password could not be changed.");
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
          <label htmlFor="current-password">Current password</label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
            maxLength={200}
          />
        </div>
        <div className="field">
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
            minLength={10}
            maxLength={200}
          />
          <span className="field-hint">At least 10 characters. Changing it revokes every other session.</span>
        </div>
      </div>
      <div className="form-actions">
        <button type="submit" className="button secondary" disabled={submitting}>
          {submitting ? "Updating..." : "Change password"}
        </button>
      </div>
    </form>
  );
}

export function DeleteAccountForm({ ownedGroups }: { ownedGroups: { id: string; name: string }[] }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiRequest("/api/account/delete", {
        method: "POST",
        body: JSON.stringify({ password, confirmation }),
      });
      router.push("/?deleted=1");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "The account could not be deleted.");
    } finally {
      setSubmitting(false);
    }
  }

  if (ownedGroups.length > 0) {
    return (
      <div className="stack">
        <p className="small">
          You still own {ownedGroups.length} group{ownedGroups.length === 1 ? "" : "s"}. Transfer ownership to another
          member or delete each group before deleting this account.
        </p>
        <ul className="plain-list">
          {ownedGroups.map((group) => (
            <li key={group.id}>
              <Link href={`/groups/${group.id}/participants`}>{group.name}</Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="stack">
      {error ? <div className="alert" role="alert">{error}</div> : null}
      <p className="small">
        The account email, name, password, sessions, and memberships are removed or disabled. Financial rows in other
        groups remain, with your participant profile renamed to an anonymized label. Export what you need first.
      </p>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="delete-password">Current password</label>
          <input
            id="delete-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="delete-confirm">Type DELETE</label>
          <input
            id="delete-confirm"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            required
            autoComplete="off"
          />
        </div>
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
        <span>I understand this cannot be undone and that anonymized ledger records may remain.</span>
      </label>
      <div className="form-actions">
        <button type="submit" className="button danger" disabled={submitting || confirmation !== "DELETE" || !acknowledged}>
          {submitting ? "Deleting..." : "Delete my account"}
        </button>
      </div>
    </form>
  );
}
