# ADR 0005: Preview ownership, fingerprints, and atomic import commits

Date: 2026-10-25
Status: accepted

## Context

Bank exports often contain repeated amounts, and two legitimate purchases can look identical. An
upload must not write records until the user has seen normalization and duplicate candidates. A
replayed commit must not create a second ledger.

## Decision

Import is a three-stage workflow:

1. Upload parses a bounded CSV and stores the file checksum, headers, raw rows, creator, and a one-hour expiry. No expense is created.
2. Mapping and preview normalize each row, validate dates, amounts, categories, payer, and beneficiaries, and calculate a fingerprint from group, date, payer, minor amount, and normalized description. Existing active expenses and earlier rows in the same file are reported as possible duplicates.
3. Commit locks the batch, revalidates creator, expiry, mapping, group state, and active participants, then recomputes duplicate matches. A chosen policy either skips possible duplicates or imports them anyway. Valid rows are inserted in one database transaction with expense, splits, and an initial revision.

The batch status and row `createdExpenseId` values are the idempotency record. A committed batch cannot
be committed again. Fingerprints are intentionally not unique constraints because identical purchases can
be legitimate; the user chooses the policy.

## Consequences

- Preview and commit cannot be separated by another user's action.
- Duplicate detection is explainable and reversible at policy level.
- Large files are bounded by explicit byte, row, column, and cell limits.
