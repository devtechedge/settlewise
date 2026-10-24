import { formatMinor } from "@/domain/money/money";

export function MonthChart({
  rows,
  currency,
}: {
  rows: { month: string; totalMinor: bigint | string }[];
  currency: string;
}) {
  const values = rows.map((row) => ({ ...row, value: typeof row.totalMinor === "string" ? BigInt(row.totalMinor) : row.totalMinor }));
  const max = values.reduce((acc, row) => (row.value > acc ? row.value : acc), 0n);
  if (values.length === 0 || max === 0n) {
    return <p className="small muted">No spending in this period.</p>;
  }
  return (
    <div className="month-grid" aria-label="Spending by month">
      {values.map((row) => {
        const height = Number((row.value * 100n) / max);
        return (
          <div className="month-bar" key={row.month}>
            <span className="month-value">{formatMinor(row.value, currency)}</span>
            <span
              className="column"
              style={{ height: `${Math.max(2, height)}%`, minHeight: `${Math.max(4, height)}px` }}
              aria-hidden="true"
            />
            <span className="month-label">{row.month}</span>
          </div>
        );
      })}
    </div>
  );
}
