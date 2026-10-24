import { formatMinor, formatMinorSigned } from "@/domain/money/money";

export function Money({
  minor,
  currency,
  signed = false,
  note = false,
  className = "",
}: {
  minor: bigint | string;
  currency: string;
  signed?: boolean;
  note?: boolean;
  className?: string;
}) {
  const value = typeof minor === "string" ? BigInt(minor) : minor;
  const tone = !signed ? "" : value > 0n ? "receivable" : value < 0n ? "owes" : "zero";
  const text = signed ? formatMinorSigned(value, currency) : formatMinor(value, currency);
  const toneNote = value > 0n ? "is owed" : value < 0n ? "owes" : "settled";
  return (
    <span className={`amount ${tone} ${className}`.trim()}>
      {text}
      {note && signed ? <span className="amount-note">{toneNote}</span> : null}
    </span>
  );
}
