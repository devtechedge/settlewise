# ADR 0006: Immutable revisions and compensating reversals

Date: 2026-10-25
Status: accepted

## Context

A financial ledger needs correction paths, but overwriting a row destroys the evidence of what changed.
Deleting a reimbursement also hides a mistake. The system must support both correction and accountability.

## Decision

Every expense has a monotonic revision. Creating writes revision 1. Editing requires the expected
revision and uses a conditional update; a mismatch returns `STALE_REVISION` rather than overwriting
another user's work. Each edit and void writes an `ExpenseRevision` with action, reason, actor, time,
and before/after snapshots. The current row is the canonical state; revision rows are append-only.

Voiding changes status and adds a revision. It does not delete splits. A settlement reversal does not
delete the original payment. It marks the original reversed and inserts a linked compensating record.
Both records are excluded from effective balances and remain visible in history.

Group deletion is an explicit owner action and removes all group-scoped records. Account deletion
anonymizes identity and membership while retaining financial rows needed by other groups, with a
documented former-participant label.

## Consequences

- Corrections and reversals are auditable without reconstructing old rows from application logs.
- JSONB snapshots can contain historical names and participant IDs; retention is documented.
- A stale client cannot silently win a write conflict.
