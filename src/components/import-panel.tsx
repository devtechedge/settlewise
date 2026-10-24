"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, apiRequest } from "@/lib/client-api";
import { Badge } from "./ui";

type Participant = { id: string; displayName: string };
type BatchSummary = {
  id: string;
  filename: string;
  status: string;
  rowCount: number;
  validCount: number;
  duplicateCount: number;
  errorCount: number;
  committedCount: number;
  skippedCount: number;
  createdAt: Date | string;
  committedAt: Date | string | null;
  expiresAt: Date | string;
};

type UploadResult = {
  batchId: string;
  headers: string[];
  rowCount: number;
  sampleRows: Record<string, string>[];
  expiresAt: string;
};

type Mapping = {
  dateColumn: string;
  descriptionColumn: string;
  amountColumn: string;
  payerColumn: string;
  categoryColumn: string | null;
  participantsColumn: string | null;
  notesColumn: string | null;
  participantIds: string[];
  payerMap: Record<string, string>;
  participantMap: Record<string, string>;
  duplicatePolicy: "SKIP" | "IMPORT_ANYWAY";
};

type RowError = { code: string; message: string; field?: string; duplicateOfRow?: number };
type PreviewRow = {
  rowNumber: number;
  normalized: { description: string; amountDisplay: string; occurredOn: string; participantNames: string[] } | null;
  status: "VALID" | "DUPLICATE" | "ERROR";
  errors: RowError[];
  matchedExpenseId: string | null;
};

type PreviewResponse = {
  ok: true;
  batchId: string;
  counts: { rowCount: number; validCount: number; duplicateCount: number; errorCount: number };
  distinctPayers: string[];
  distinctParticipants: string[];
  unmappedPayers: string[];
  unmappedParticipants: string[];
  previewRows: PreviewRow[];
  expiresAt: string;
};

const REQUIRED_FIELDS: { key: keyof Mapping; label: string; hints: string[] }[] = [
  { key: "dateColumn", label: "Date", hints: ["date", "occurred", "day"] },
  { key: "descriptionColumn", label: "Description", hints: ["description", "memo", "detail", "item"] },
  { key: "amountColumn", label: "Amount", hints: ["amount", "total", "value", "cost"] },
  { key: "payerColumn", label: "Payer", hints: ["payer", "paid by", "paidby", "who"] },
];

const OPTIONAL_FIELDS: { key: keyof Mapping; label: string; hints: string[] }[] = [
  { key: "categoryColumn", label: "Category", hints: ["category", "type", "kind"] },
  { key: "participantsColumn", label: "Beneficiaries", hints: ["participants", "beneficiaries", "shared with", "split"] },
  { key: "notesColumn", label: "Notes", hints: ["notes", "note", "comment"] },
];

function guessColumn(headers: string[], hints: string[]): string {
  for (const hint of hints) {
    const match = headers.find((header) => header.toLowerCase().replace(/[^a-z0-9]/g, " ").includes(hint));
    if (match) return match;
  }
  return "";
}

function autoMap(names: string[], participants: Participant[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const name of names) {
    const match = participants.find((participant) => participant.displayName.toLowerCase() === name.toLowerCase());
    if (match) map[name] = match.id;
  }
  return map;
}

function statusBadge(status: string) {
  if (status === "VALID") return <Badge variant="active">valid</Badge>;
  if (status === "DUPLICATE") return <Badge variant="duplicate">possible duplicate</Badge>;
  if (status === "ERROR") return <Badge variant="void">needs attention</Badge>;
  if (status === "COMMITTED") return <Badge variant="active">committed</Badge>;
  return <Badge>{status.toLowerCase()}</Badge>;
}

export function ImportPanel({
  groupId,
  participants,
  batches,
}: {
  groupId: string;
  participants: Participant[];
  batches: BatchSummary[];
}) {
  const router = useRouter();
  const [batch, setBatch] = useState<UploadResult | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [committed, setCommitted] = useState<{ committedCount: number; skippedCount: number; errorCount: number } | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  function reset() {
    setBatch(null);
    setPreview(null);
    setMapping(null);
    setError(null);
    setNotice(null);
    setCommitted(null);
    setStale(false);
    setFileInputKey((value) => value + 1);
  }

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await apiRequest<UploadResult>(`/api/groups/${groupId}/imports/preview`, {
        method: "POST",
        body: form,
      });
      setBatch(result);
      const base: Mapping = {
        dateColumn: guessColumn(result.headers, REQUIRED_FIELDS[0]?.hints ?? []),
        descriptionColumn: guessColumn(result.headers, REQUIRED_FIELDS[1]?.hints ?? []),
        amountColumn: guessColumn(result.headers, REQUIRED_FIELDS[2]?.hints ?? []),
        payerColumn: guessColumn(result.headers, REQUIRED_FIELDS[3]?.hints ?? []),
        categoryColumn: guessColumn(result.headers, OPTIONAL_FIELDS[0]?.hints ?? []) || null,
        participantsColumn: guessColumn(result.headers, OPTIONAL_FIELDS[1]?.hints ?? []) || null,
        notesColumn: guessColumn(result.headers, OPTIONAL_FIELDS[2]?.hints ?? []) || null,
        participantIds: participants.map((participant) => participant.id),
        payerMap: {},
        participantMap: {},
        duplicatePolicy: "SKIP",
      };
      setMapping(base);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "The file could not be read.");
    } finally {
      setUploading(false);
    }
  }

  function updateMapping(patch: Partial<Mapping>) {
    setMapping((current) => (current ? { ...current, ...patch } : current));
    setStale(true);
  }

  async function runPreview(override?: Mapping) {
    const current = override ?? mapping;
    if (!current || !batch) return;
    setPreviewing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await apiRequest<PreviewResponse>(`/api/groups/${groupId}/imports/preview`, {
        method: "POST",
        body: JSON.stringify({ batchId: batch.batchId, mapping: current }),
      });
      setPreview(response);
      setStale(false);
      const payerMap = { ...current.payerMap, ...autoMap(response.unmappedPayers, participants) };
      const participantMap = { ...current.participantMap, ...autoMap(response.unmappedParticipants, participants) };
      const changed =
        Object.keys(payerMap).length !== Object.keys(current.payerMap).length ||
        Object.keys(participantMap).length !== Object.keys(current.participantMap).length;
      if (changed) {
        const merged = { ...current, payerMap, participantMap };
        setMapping(merged);
        await runPreview(merged);
        return;
      }
      setMapping(current);
      if (response.unmappedPayers.length > 0 || response.unmappedParticipants.length > 0) {
        setNotice("Map the remaining names below, then preview again.");
      }
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "The preview could not be built.");
    } finally {
      setPreviewing(false);
    }
  }

  async function commit() {
    if (!batch) return;
    setCommitting(true);
    setError(null);
    try {
      const result = await apiRequest<{ committedCount: number; skippedCount: number; errorCount: number }>(
        `/api/groups/${groupId}/imports/commit`,
        { method: "POST", body: JSON.stringify({ batchId: batch.batchId }) },
      );
      setCommitted(result);
      setNotice(`Committed ${result.committedCount} expense${result.committedCount === 1 ? "" : "s"}.`);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : "The import could not be committed.");
    } finally {
      setCommitting(false);
    }
  }

  const readyForPreview =
    mapping &&
    mapping.dateColumn &&
    mapping.descriptionColumn &&
    mapping.amountColumn &&
    mapping.payerColumn &&
    mapping.participantIds.length > 0;
  const unmappedCount = preview ? preview.unmappedPayers.length + preview.unmappedParticipants.length : 0;

  return (
    <div className="stack-lg">
      <div className="import-steps" aria-label="Import progress">
        <div className={`import-step ${batch ? "complete" : "current"}`}><strong>01</strong>Upload a CSV</div>
        <div className={`import-step ${preview ? "complete" : batch ? "current" : ""}`}><strong>02</strong>Map columns and names</div>
        <div className={`import-step ${committed ? "complete" : preview ? "current" : ""}`}><strong>03</strong>Review duplicates and errors</div>
        <div className={`import-step ${committed ? "current" : ""}`}><strong>04</strong>Commit atomically</div>
      </div>

      {error ? <div className="alert" role="alert">{error}</div> : null}
      {notice ? <div className="alert success" role="status">{notice}</div> : null}

      {!batch ? (
        <div className="card">
          <div className="card-header"><h2>Upload a statement export</h2></div>
          <div className="card-body stack">
            <div className="upload-box">
              <label htmlFor="csv-file" style={{ fontWeight: 600 }}>CSV file</label>
              <input
                key={fileInputKey}
                id="csv-file"
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
              <p className="small muted" style={{ margin: 0 }}>
                Maximum 2 MB, 2,000 data rows, and 60 columns. Header row required. Nothing is imported until you preview
                and commit.
              </p>
            </div>
            {uploading ? <p className="small" role="status">Reading and checking the file...</p> : null}
            <div className="notice">
              <strong>Required columns:</strong> date (YYYY-MM-DD), description, amount, payer. Optional: category,
              beneficiaries, notes. Beneficiary names are separated with a semicolon or pipe. If no beneficiaries column
              is mapped, the default participant selection below is used.
            </div>
          </div>
        </div>
      ) : null}

      {batch && mapping ? (
        <>
          <div className="card">
            <div className="card-header">
              <div>
                <h2>{batch.rowCount} rows read</h2>
                <span className="small muted">{batch.headers.join(" · ")}</span>
              </div>
              <button type="button" className="button ghost small" onClick={reset}>Upload a different file</button>
            </div>
            <div className="card-body stack-lg">
              <div>
                <h3>Map columns</h3>
                <div className="map-grid">
                  <div className="map-card">
                    <h3>Required fields</h3>
                    <div className="map-list">
                      {REQUIRED_FIELDS.map((field) => (
                        <div className="map-line" key={field.key}>
                          <label htmlFor={`map-${field.key}`}>{field.label}</label>
                          <select
                            id={`map-${field.key}`}
                            value={(mapping[field.key] as string) ?? ""}
                            onChange={(event) => updateMapping({ [field.key]: event.target.value } as Partial<Mapping>)}
                          >
                            <option value="">Choose a column</option>
                            {batch.headers.map((header) => (
                              <option key={header} value={header}>{header}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="map-card">
                    <h3>Optional fields</h3>
                    <div className="map-list">
                      {OPTIONAL_FIELDS.map((field) => (
                        <div className="map-line" key={field.key}>
                          <label htmlFor={`map-${field.key}`}>{field.label}</label>
                          <select
                            id={`map-${field.key}`}
                            value={(mapping[field.key] as string | null) ?? ""}
                            onChange={(event) => updateMapping({ [field.key]: event.target.value || null } as Partial<Mapping>)}
                          >
                            <option value="">None</option>
                            {batch.headers.map((header) => (
                              <option key={header} value={header}>{header}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3>Default beneficiaries</h3>
                <p className="small muted">Used only when the CSV row has no beneficiaries column value or it is blank.</p>
                <div className="cluster">
                  {participants.map((participant) => {
                    const checked = mapping.participantIds.includes(participant.id);
                    return (
                      <label className="checkbox" key={participant.id}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            updateMapping({
                              participantIds: checked
                                ? mapping.participantIds.filter((id) => id !== participant.id)
                                : [...mapping.participantIds, participant.id],
                            })
                          }
                        />
                        <span>{participant.displayName}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <h3>Duplicate policy</h3>
                <div className="stack">
                  <label className="checkbox">
                    <input
                      type="radio"
                      name="duplicate-policy"
                      checked={mapping.duplicatePolicy === "SKIP"}
                      onChange={() => updateMapping({ duplicatePolicy: "SKIP" })}
                    />
                    <span>
                      <strong>Skip possible duplicates</strong> · rows whose date, payer, amount, and normalized description match an
                      active expense or an earlier row are skipped at commit.
                    </span>
                  </label>
                  <label className="checkbox">
                    <input
                      type="radio"
                      name="duplicate-policy"
                      checked={mapping.duplicatePolicy === "IMPORT_ANYWAY"}
                      onChange={() => updateMapping({ duplicatePolicy: "IMPORT_ANYWAY" })}
                    />
                    <span>
                      <strong>Import anyway</strong> · possible duplicates are committed as separate expenses. Only choose this after
                      checking the rows.
                    </span>
                  </label>
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="button"
                  onClick={() => void runPreview()}
                  disabled={!readyForPreview || previewing}
                >
                  {previewing ? "Building preview..." : stale && preview ? "Preview again" : "Preview import"}
                </button>
                <span className="small muted">Nothing is written to the ledger until commit.</span>
              </div>
            </div>
          </div>

          {preview ? (
            <div className="card">
              <div className="card-header">
                <h2>Preview</h2>
                <div className="count-strip">
                  <span className="count-pill valid">{preview.counts.validCount} valid</span>
                  <span className="count-pill duplicate">{preview.counts.duplicateCount} duplicate</span>
                  <span className="count-pill error">{preview.counts.errorCount} error</span>
                </div>
              </div>
              <div className="card-body stack">
                {unmappedCount > 0 ? (
                  <div className="notice">
                    <strong>{unmappedCount} names still need mapping.</strong> Rows with unmapped names are errors and will not
                    be imported.
                  </div>
                ) : null}
                {preview.distinctPayers.length > 0 ? (
                  <div className="map-card">
                    <h3>Payer names in this file</h3>
                    <div className="map-list">
                      {preview.distinctPayers.map((name) => (
                        <div className="map-line" key={name}>
                          <span>{name}</span>
                          <select
                            aria-label={`Map payer ${name}`}
                            value={mapping.payerMap[name] ?? ""}
                            onChange={(event) => {
                              const next = { ...mapping.payerMap };
                              if (event.target.value) next[name] = event.target.value;
                              else delete next[name];
                              updateMapping({ payerMap: next });
                            }}
                          >
                            <option value="">Not mapped</option>
                            {participants.map((participant) => (
                              <option key={participant.id} value={participant.id}>{participant.displayName}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {preview.distinctParticipants.length > 0 ? (
                  <div className="map-card">
                    <h3>Beneficiary names in this file</h3>
                    <div className="map-list">
                      {preview.distinctParticipants.map((name) => (
                        <div className="map-line" key={name}>
                          <span>{name}</span>
                          <select
                            aria-label={`Map beneficiary ${name}`}
                            value={mapping.participantMap[name] ?? ""}
                            onChange={(event) => {
                              const next = { ...mapping.participantMap };
                              if (event.target.value) next[name] = event.target.value;
                              else delete next[name];
                              updateMapping({ participantMap: next });
                            }}
                          >
                            <option value="">Not mapped</option>
                            {participants.map((participant) => (
                              <option key={participant.id} value={participant.id}>{participant.displayName}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {stale ? (
                  <div className="alert" role="alert">Mapping changed. Preview again before committing.</div>
                ) : null}

                <div className="table-wrap">
                  <table className="ledger">
                    <caption className="visually-hidden">First 100 preview rows.</caption>
                    <thead>
                      <tr>
                        <th scope="col">Row</th>
                        <th scope="col">Status</th>
                        <th scope="col">Date</th>
                        <th scope="col">Description</th>
                        <th scope="col">Beneficiaries</th>
                        <th scope="col" className="num">Amount</th>
                        <th scope="col">Issues</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.previewRows.map((row) => (
                        <tr key={row.rowNumber}>
                          <td className="mono small">{row.rowNumber}</td>
                          <td>{statusBadge(row.status)}</td>
                          <td className="mono small">{row.normalized?.occurredOn ?? "—"}</td>
                          <td>{row.normalized?.description ?? "—"}</td>
                          <td className="small">{row.normalized?.participantNames.join(", ") || "—"}</td>
                          <td className="num">{row.normalized?.amountDisplay ?? "—"}</td>
                          <td>
                            {row.errors.length > 0 ? (
                              <ul className="row-errors">
                                {row.errors.map((issue) => (
                                  <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>
                                ))}
                              </ul>
                            ) : (
                              <span className="small muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="small muted">
                  Showing {preview.previewRows.length} of {preview.counts.rowCount} rows. Duplicate detection is a warning,
                  not proof: identical amounts on the same day can be legitimate.
                </p>

                {committed ? (
                  <div className="alert success" role="status">
                    Commit finished: {committed.committedCount} created, {committed.skippedCount} skipped, {committed.errorCount} left
                    as errors. <button type="button" className="link-button" onClick={reset}>Start another import</button>
                  </div>
                ) : (
                  <div className="form-actions">
                    <button
                      type="button"
                      className="button"
                      onClick={() => void commit()}
                      disabled={committing || stale || preview.counts.validCount + preview.counts.duplicateCount === 0}
                    >
                      {committing
                        ? "Committing..."
                        : preview.counts.duplicateCount > 0 && mapping.duplicatePolicy === "SKIP"
                          ? `Commit ${preview.counts.validCount} rows and skip duplicates`
                          : `Commit ${preview.counts.validCount + preview.counts.duplicateCount} rows`}
                    </button>
                    <span className="small muted">
                      Revalidated at commit. Expires {new Date(preview.expiresAt).toISOString().slice(11, 16)} UTC.
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {!preview ? (
            <div className="card">
              <div className="card-header"><h3>Sample rows</h3></div>
              <div className="card-body">
                <div className="table-wrap">
                  <table className="ledger">
                    <thead>
                      <tr>
                        {batch.headers.map((header) => <th scope="col" key={header}>{header}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {batch.sampleRows.map((row, index) => (
                        <tr key={index}>
                          {batch.headers.map((header) => <td key={header}>{row[header]}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      <section className="card">
        <div className="card-header">
          <h2>Import history</h2>
          <span className="small muted">newest first</span>
        </div>
        <div className="card-body">
          {batches.length === 0 ? (
            <p className="small muted">No import batches yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="ledger">
                <thead>
                  <tr>
                    <th scope="col">Uploaded</th>
                    <th scope="col">File</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="num">Rows</th>
                    <th scope="col" className="num">Committed</th>
                    <th scope="col" className="num">Skipped</th>
                    <th scope="col" className="num">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((item) => (
                    <tr key={item.id}>
                      <td className="mono small">{new Date(item.createdAt).toISOString().slice(0, 16).replace("T", " ")}</td>
                      <td>{item.filename}</td>
                      <td><Badge variant={item.status === "COMMITTED" ? "active" : item.status === "EXPIRED" ? "expired" : "duplicate"}>{item.status.toLowerCase()}</Badge></td>
                      <td className="num">{item.rowCount}</td>
                      <td className="num">{item.committedCount}</td>
                      <td className="num">{item.skippedCount}</td>
                      <td className="num">{item.errorCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
