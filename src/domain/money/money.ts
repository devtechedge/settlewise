import { AppError } from "@/lib/errors";
import { getCurrency, type Currency, type CurrencyCode } from "./currency";

const MAX_MINOR = 1_000_000_000_000n;

export function maxMinorUnits(): bigint {
  return MAX_MINOR;
}

export function parseMinorDigits(input: string, precision: number): bigint {
  const value = input.trim();
  if (value.length === 0) {
    throw new AppError("INVALID_MONEY", "Enter an amount.");
  }
  if (precision === 0) {
    if (!/^\d{1,15}$/.test(value)) {
      throw new AppError("INVALID_MONEY", "Enter a whole-number amount with no decimal places.");
    }
    return assertRange(BigInt(value));
  }
  const match = /^(\d{1,15})(?:\.(\d+))?$/.exec(value);
  if (!match) {
    throw new AppError("INVALID_MONEY", "Use digits only, with an optional decimal point.");
  }
  const fraction = match[2] ?? "";
  if (fraction.length > precision) {
    throw new AppError(
      "INVALID_MONEY",
      `This currency allows at most ${precision} decimal place${precision === 1 ? "" : "s"}.`,
    );
  }
  const whole = BigInt(match[1] ?? "0");
  const scaled = BigInt(fraction.padEnd(precision, "0") || "0");
  const minor = whole * 10n ** BigInt(precision) + scaled;
  return assertRange(minor);
}

function assertRange(minor: bigint): bigint {
  if (minor < 0n) {
    throw new AppError("INVALID_MONEY", "Amounts cannot be negative.");
  }
  if (minor > MAX_MINOR) {
    throw new AppError("AMOUNT_TOO_LARGE", "This amount is larger than the supported limit.");
  }
  return minor;
}

export function parseMoneyToMinor(input: string, currencyCode: string): bigint {
  const currency = getCurrency(currencyCode);
  return parseMinorDigits(input, currency.precision);
}

export function parsePositiveMoneyToMinor(input: string, currencyCode: string): bigint {
  const minor = parseMoneyToMinor(input, currencyCode);
  if (minor <= 0n) {
    throw new AppError("INVALID_MONEY", "Amount must be greater than zero.");
  }
  return minor;
}

export function parsePercentToBasisPoints(input: string): number {
  const value = input.trim();
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) {
    throw new AppError("INVALID_PERCENTAGE", "Enter a percentage with up to two decimal places.");
  }
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const bps = whole * 100 + fraction;
  if (bps < 0 || bps > 10_000) {
    throw new AppError("INVALID_PERCENTAGE", "Percentages must be between 0 and 100.");
  }
  return bps;
}

export function minorToPlainString(minor: bigint, currency: Currency): string {
  if (minor < 0n) {
    throw new AppError("INVALID_MONEY", "Cannot format a negative amount as a positive decimal.");
  }
  const scale = 10n ** BigInt(currency.precision);
  const whole = minor / scale;
  if (currency.precision === 0) return whole.toString();
  const fraction = (minor % scale).toString().padStart(currency.precision, "0");
  return `${whole}.${fraction}`;
}

export function formatMinor(minor: bigint, currencyCode: string): string {
  const currency = getCurrency(currencyCode);
  const asNumber = Number(minor);
  if (!Number.isSafeInteger(asNumber)) {
    throw new AppError("AMOUNT_TOO_LARGE", "This amount cannot be displayed safely.");
  }
  const sign = asNumber < 0 ? "-" : "";
  const formatter = new Intl.NumberFormat(currency.locale, {
    style: "currency",
    currency: currency.code,
    minimumFractionDigits: currency.precision,
    maximumFractionDigits: currency.precision,
  });
  return `${sign}${formatter.format(Math.abs(asNumber) / 10 ** currency.precision)}`;
}

export function formatMinorSigned(minor: bigint, currencyCode: string): string {
  if (minor > 0n) return `+${formatMinor(minor, currencyCode)}`;
  if (minor < 0n) return `-${formatMinor(-minor, currencyCode)}`;
  return formatMinor(0n, currencyCode);
}

export function currencyPrecision(code: CurrencyCode): number {
  return getCurrency(code).precision;
}
