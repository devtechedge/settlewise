import type { ReactNode } from "react";
import { formatMinor } from "@/domain/money/money";

export function Badge({ children, variant = "" }: { children: ReactNode; variant?: string }) {
  return <span className={`badge ${variant}`.trim()}>{children}</span>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <div className="muted small" style={{ maxWidth: "70ch" }}>{description}</div> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-rule" />
      <h3>{title}</h3>
      <p>{children}</p>
      {action ? <div style={{ marginTop: "1rem" }}>{action}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note ? <div className="stat-note">{note}</div> : null}
    </div>
  );
}

export function BarChart({
  rows,
  currency,
  emptyText = "No spending in this period.",
}: {
  rows: { label: string; valueMinor: bigint | string; note?: string }[];
  currency: string;
  emptyText?: string;
}) {
  const values = rows.map((row) => ({ ...row, value: typeof row.valueMinor === "string" ? BigInt(row.valueMinor) : row.valueMinor }));
  const max = values.reduce((acc, row) => (row.value > acc ? row.value : acc), 0n);
  if (values.length === 0 || max === 0n) {
    return <p className="muted small">{emptyText}</p>;
  }
  return (
    <div className="chart-bars" aria-label="Spending by category">
      {values.map((row) => {
        const width = Number((row.value * 1000n) / max) / 10;
        return (
          <div className="chart-row" key={row.label}>
            <span className="chart-label" title={row.label}>{row.label}</span>
            <span className="chart-track" aria-hidden="true">
              <span className="chart-fill" style={{ width: `${width}%`, display: "block" }} />
            </span>
            <span className="chart-value">
              {formatMinor(row.value, currency)}
              {row.note ? <span className="visually-hidden"> {row.note}</span> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}
