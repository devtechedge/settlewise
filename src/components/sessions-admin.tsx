"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, apiRequest } from "@/lib/client-api";
import { Badge } from "./ui";

type SessionRow = {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  userAgent: string | null;
};

export function SessionsAdmin({ sessions, currentSessionId }: { sessions: SessionRow[]; currentSessionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function revoke(id: string) {
    setBusy(id);
    setError(null);
    setSuccess(null);
    try {
      await apiRequest(`/api/sessions/${id}`, { method: "DELETE" });
      setSuccess("Session revoked.");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "The session could not be revoked.");
    } finally {
      setBusy(null);
    }
  }

  async function revokeOthers() {
    setBusy("others");
    setError(null);
    setSuccess(null);
    try {
      await apiRequest("/api/sessions/revoke-others", { method: "POST" });
      setSuccess("All other sessions were revoked.");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "Other sessions could not be revoked.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack">
      {error ? <div className="alert" role="alert">{error}</div> : null}
      {success ? <div className="alert success" role="status">{success}</div> : null}
      <div className="table-wrap">
        <table className="ledger">
          <thead>
            <tr>
              <th scope="col">Created</th>
              <th scope="col">Last used</th>
              <th scope="col">Expires</th>
              <th scope="col">Device</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => {
              const current = session.id === currentSessionId;
              return (
                <tr key={session.id}>
                  <td className="mono small">{session.createdAt.slice(0, 16).replace("T", " ")}</td>
                  <td className="mono small">{session.lastUsedAt.slice(0, 16).replace("T", " ")}</td>
                  <td className="mono small">{session.expiresAt.slice(0, 10)}</td>
                  <td className="small">
                    {session.userAgent ?? "Unknown browser"}
                    {current ? <Badge variant="active">this session</Badge> : null}
                  </td>
                  <td>
                    {current ? (
                      <span className="small muted">Current</span>
                    ) : (
                      <button type="button" className="button ghost small" onClick={() => void revoke(session.id)} disabled={busy === session.id}>
                        {busy === session.id ? "Revoking..." : "Revoke"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="form-actions">
        <button type="button" className="button danger small" onClick={() => void revokeOthers()} disabled={busy === "others" || sessions.length <= 1}>
          {busy === "others" ? "Revoking..." : "Revoke all other sessions"}
        </button>
      </div>
    </div>
  );
}
