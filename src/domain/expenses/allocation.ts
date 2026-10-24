import { AppError } from "@/lib/errors";
import type { SplitMethod } from "@/domain/money/currency";

export type EqualSplitInput = {
  method: "EQUAL";
  participantIds: string[];
};

export type ExactSplitInput = {
  method: "EXACT";
  entries: { participantId: string; amountMinor: bigint }[];
};

export type PercentSplitInput = {
  method: "PERCENT";
  entries: { participantId: string; basisPoints: number }[];
};

export type SharesSplitInput = {
  method: "SHARES";
  entries: { participantId: string; shares: number }[];
};

export type SplitInput = EqualSplitInput | ExactSplitInput | PercentSplitInput | SharesSplitInput;

export type SplitAllocation = {
  participantId: string;
  amountMinor: bigint;
  method: SplitMethod;
  basisPoints: number | null;
  shares: number | null;
};

export type AllocationResult = {
  method: SplitMethod;
  totalMinor: bigint;
  allocations: SplitAllocation[];
  residualMinor: bigint;
  residualRecipients: string[];
  rule: string;
};

const MAX_BENEFICIARIES = 100;
const MAX_SHARES = 1_000_000;

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function assertDistinct(ids: string[]) {
  if (ids.length === 0) {
    throw new AppError("INVALID_ALLOCATION", "Select at least one participant.");
  }
  if (ids.length > MAX_BENEFICIARIES) {
    throw new AppError("INVALID_ALLOCATION", `A split can include at most ${MAX_BENEFICIARIES} participants.`);
  }
  if (new Set(ids).size !== ids.length) {
    throw new AppError("DUPLICATE_BENEFICIARY", "Each participant can appear only once in a split.");
  }
}

function assertTotal(totalMinor: bigint) {
  if (totalMinor <= 0n) {
    throw new AppError("INVALID_ALLOCATION", "The expense total must be greater than zero.");
  }
}

function result(
  method: SplitMethod,
  totalMinor: bigint,
  allocations: SplitAllocation[],
  residualMinor: bigint,
  residualRecipients: string[],
  rule: string,
): AllocationResult {
  const sum = allocations.reduce((acc, row) => acc + row.amountMinor, 0n);
  if (sum !== totalMinor) {
    throw new AppError("BALANCE_INVARIANT", "Allocation did not sum to the expense total.");
  }
  if (allocations.some((row) => row.amountMinor < 0n)) {
    throw new AppError("BALANCE_INVARIANT", "Allocation produced a negative share.");
  }
  return {
    method,
    totalMinor,
    allocations: [...allocations].sort((a, b) => compareIds(a.participantId, b.participantId)),
    residualMinor,
    residualRecipients,
    rule,
  };
}

function allocateEqual(totalMinor: bigint, participantIds: string[]): AllocationResult {
  assertTotal(totalMinor);
  assertDistinct(participantIds);
  const sorted = [...participantIds].sort(compareIds);
  const count = BigInt(sorted.length);
  const base = totalMinor / count;
  const remainder = totalMinor % count;
  const recipients = sorted.slice(0, Number(remainder));
  const allocations = sorted.map((participantId) => ({
    participantId,
    amountMinor: base + (recipients.includes(participantId) ? 1n : 0n),
    method: "EQUAL" as const,
    basisPoints: null,
    shares: null,
  }));
  return result(
    "EQUAL",
    totalMinor,
    allocations,
    remainder,
    recipients,
    "Equal split. Base share is the total divided by the number of beneficiaries, rounded down. One extra minor unit goes to each of the first recipients by participant ID in ascending order.",
  );
}

function allocateExact(totalMinor: bigint, entries: ExactSplitInput["entries"]): AllocationResult {
  assertTotal(totalMinor);
  assertDistinct(entries.map((entry) => entry.participantId));
  if (entries.some((entry) => entry.amountMinor < 0n)) {
    throw new AppError("INVALID_ALLOCATION", "Exact shares cannot be negative.");
  }
  const sum = entries.reduce((acc, entry) => acc + entry.amountMinor, 0n);
  if (sum !== totalMinor) {
    throw new AppError("INVALID_ALLOCATION", "Exact shares must add up to the expense total.", {
      expected: totalMinor.toString(),
      actual: sum.toString(),
    });
  }
  const allocations = entries.map((entry) => ({
    participantId: entry.participantId,
    amountMinor: entry.amountMinor,
    method: "EXACT" as const,
    basisPoints: null,
    shares: null,
  }));
  return result(
    "EXACT",
    totalMinor,
    allocations,
    0n,
    [],
    "Exact split. Each share is entered directly and must sum exactly to the expense total.",
  );
}

function allocatePercent(totalMinor: bigint, entries: PercentSplitInput["entries"]): AllocationResult {
  assertTotal(totalMinor);
  assertDistinct(entries.map((entry) => entry.participantId));
  let sumBps = 0;
  for (const entry of entries) {
    if (!Number.isInteger(entry.basisPoints) || entry.basisPoints < 0 || entry.basisPoints > 10_000) {
      throw new AppError("INVALID_PERCENTAGE", "Percentages must be whole basis points between 0 and 10,000.");
    }
    sumBps += entry.basisPoints;
  }
  if (sumBps !== 10_000) {
    throw new AppError("INVALID_PERCENTAGE", "Percentages must add up to exactly 100%.", {
      expectedBasisPoints: 10_000,
      actualBasisPoints: sumBps,
    });
  }
  const computed = [...entries]
    .sort((a, b) => compareIds(a.participantId, b.participantId))
    .map((entry) => {
      const numerator = totalMinor * BigInt(entry.basisPoints);
      const amountMinor = numerator / 10_000n;
      const remainder = numerator % 10_000n;
      return { ...entry, amountMinor, remainder };
    });
  const distributed = computed.reduce((acc, row) => acc + row.amountMinor, 0n);
  const residual = totalMinor - distributed;
  const ranked = [...computed].sort((a, b) => {
    if (a.remainder === b.remainder) return compareIds(a.participantId, b.participantId);
    return a.remainder > b.remainder ? -1 : 1;
  });
  const recipients = new Set(ranked.slice(0, Number(residual)).map((row) => row.participantId));
  const allocations = computed.map((row) => ({
    participantId: row.participantId,
    amountMinor: row.amountMinor + (recipients.has(row.participantId) ? 1n : 0n),
    method: "PERCENT" as const,
    basisPoints: row.basisPoints,
    shares: null,
  }));
  return result(
    "PERCENT",
    totalMinor,
    allocations,
    residual,
    ranked.slice(0, Number(residual)).map((row) => row.participantId),
    "Percentage split in basis points (1% = 100 bp). Each share is rounded down, then residual minor units are assigned by largest remainder, breaking ties by participant ID in ascending order.",
  );
}

function allocateShares(totalMinor: bigint, entries: SharesSplitInput["entries"]): AllocationResult {
  assertTotal(totalMinor);
  assertDistinct(entries.map((entry) => entry.participantId));
  let totalShares = 0;
  for (const entry of entries) {
    if (!Number.isInteger(entry.shares) || entry.shares <= 0 || entry.shares > MAX_SHARES) {
      throw new AppError("INVALID_SHARES", `Each weight must be a positive whole number no larger than ${MAX_SHARES}.`);
    }
    totalShares += entry.shares;
  }
  if (totalShares === 0) {
    throw new AppError("INVALID_SHARES", "The total weight must be greater than zero.");
  }
  const computed = [...entries]
    .sort((a, b) => compareIds(a.participantId, b.participantId))
    .map((entry) => {
      const numerator = totalMinor * BigInt(entry.shares);
      const amountMinor = numerator / BigInt(totalShares);
      const remainder = numerator % BigInt(totalShares);
      return { ...entry, amountMinor, remainder };
    });
  const distributed = computed.reduce((acc, row) => acc + row.amountMinor, 0n);
  const residual = totalMinor - distributed;
  const ranked = [...computed].sort((a, b) => {
    if (a.remainder === b.remainder) return compareIds(a.participantId, b.participantId);
    return a.remainder > b.remainder ? -1 : 1;
  });
  const recipients = new Set(ranked.slice(0, Number(residual)).map((row) => row.participantId));
  const allocations = computed.map((row) => ({
    participantId: row.participantId,
    amountMinor: row.amountMinor + (recipients.has(row.participantId) ? 1n : 0n),
    method: "SHARES" as const,
    basisPoints: null,
    shares: row.shares,
  }));
  return result(
    "SHARES",
    totalMinor,
    allocations,
    residual,
    ranked.slice(0, Number(residual)).map((row) => row.participantId),
    "Weighted split. Each share is total times weight divided by total weight, rounded down, then residual minor units are assigned by largest remainder, breaking ties by participant ID in ascending order.",
  );
}

export function allocateSplit(totalMinor: bigint, input: SplitInput): AllocationResult {
  switch (input.method) {
    case "EQUAL":
      return allocateEqual(totalMinor, input.participantIds);
    case "EXACT":
      return allocateExact(totalMinor, input.entries);
    case "PERCENT":
      return allocatePercent(totalMinor, input.entries);
    case "SHARES":
      return allocateShares(totalMinor, input.entries);
  }
}
