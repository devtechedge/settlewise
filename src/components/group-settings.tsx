"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, apiRequest } from "@/lib/client-api";

export function GroupSettings({
  groupId,
  groupName,
  archived,
}: {
  groupId: string;
  groupName: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState("");

  async function setArchived(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/api/groups/${groupId}`, {
        method: "PATCH",
        body: JSON.stringify({ archived: next }),
      });
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "The group could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteGroup() {
    if (!window.confirm(`Delete ${groupName} and every expense, payment, import, and audit event in it? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/api/groups/${groupId}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmation }),
      });
      router.push("/groups");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "The group could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="danger-zone stack">
      <div>
        <h2>Group lifecycle</h2>
        <p className="small">
          Archive keeps every record and blocks new writes. Delete removes the group and all of its records permanently.
          Export first if you need a copy.
        </p>
      </div>
      {error ? <div className="alert" role="alert">{error}</div> : null}
      <div className="cluster">
        <a className="button secondary small" href={`/api/groups/${groupId}/exports?type=expenses`}>Export expenses CSV</a>
        <a className="button secondary small" href={`/api/groups/${groupId}/exports?type=settlements`}>Export payments CSV</a>
        <a className="button secondary small" href={`/api/groups/${groupId}/exports?type=audit`}>Export audit CSV</a>
      </div>
      <div className="form-actions">
        <button type="button" className="button secondary" onClick={() => void setArchived(!archived)} disabled={busy}>
          {archived ? "Restore group" : "Archive group"}
        </button>
      </div>
      <hr className="divider" />
      <div className="field">
        <label htmlFor="delete-confirmation">Type the group name to delete permanently</label>
        <input
          id="delete-confirmation"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder={groupName}
          autoComplete="off"
        />
      </div>
      <div className="form-actions">
        <button
          type="button"
          className="button danger"
          onClick={() => void deleteGroup()}
          disabled={busy || confirmation !== groupName}
        >
          Delete group permanently
        </button>
      </div>
    </div>
  );
}
