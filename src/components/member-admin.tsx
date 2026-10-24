"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, apiRequest } from "@/lib/client-api";

export function MemberActions({
  groupId,
  member,
  isOwner,
  isSelf,
}: {
  groupId: string;
  member: { userId: string; displayName: string; role: string };
  isOwner: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmingTransfer, setConfirmingTransfer] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeRole(role: string) {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/api/groups/${groupId}/members/${member.userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "The role could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${member.displayName} from this group? Their participant profile stays for ledger history but becomes inactive.`)) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/api/groups/${groupId}/members/${member.userId}`, { method: "DELETE" });
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "The member could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  async function transfer() {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/api/groups/${groupId}/ownership`, {
        method: "POST",
        body: JSON.stringify({ userId: member.userId }),
      });
      setConfirmingTransfer(false);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Ownership could not be transferred.");
    } finally {
      setBusy(false);
    }
  }

  if (!isOwner || member.role === "OWNER") {
    return <span className="small muted">{member.role.toLowerCase()}</span>;
  }

  return (
    <div className="stack" style={{ gap: "0.35rem" }}>
      {error ? <span className="field-error" role="alert">{error}</span> : null}
      <div className="cluster" style={{ gap: "0.35rem" }}>
        <label className="visually-hidden" htmlFor={`role-${member.userId}`}>Role for {member.displayName}</label>
        <select
          id={`role-${member.userId}`}
          value={member.role}
          onChange={(event) => void changeRole(event.target.value)}
          disabled={busy || isSelf}
          style={{ minHeight: 34, border: "1px solid var(--line)", borderRadius: 5, background: "var(--paper)" }}
        >
          <option value="MEMBER">Member</option>
          <option value="EDITOR">Editor</option>
        </select>
        <button type="button" className="button ghost small" onClick={() => void remove()} disabled={busy || isSelf}>
          Remove
        </button>
        {confirmingTransfer ? (
          <>
            <button type="button" className="button danger small" onClick={() => void transfer()} disabled={busy}>
              Confirm owner
            </button>
            <button type="button" className="button ghost small" onClick={() => setConfirmingTransfer(false)}>Cancel</button>
          </>
        ) : (
          <button type="button" className="button ghost small" onClick={() => setConfirmingTransfer(true)} disabled={busy || isSelf}>
            Make owner
          </button>
        )}
      </div>
      {confirmingTransfer ? (
        <span className="field-error">You become an editor. The new owner controls membership and deletion.</span>
      ) : null}
    </div>
  );
}
