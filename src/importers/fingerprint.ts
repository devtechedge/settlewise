import { createHash } from "node:crypto";

export function normalizeDescription(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function expenseFingerprint(input: {
  groupId: string;
  occurredOn: string;
  payerParticipantId: string;
  amountMinor: bigint;
  description: string;
}): string {
  const payload = [
    input.groupId,
    input.occurredOn,
    input.payerParticipantId,
    input.amountMinor.toString(),
    normalizeDescription(input.description),
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}
