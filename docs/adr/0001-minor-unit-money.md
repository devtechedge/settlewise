# ADR 0001: Integer minor units are the only authoritative money type

Date: 2026-10-25
Status: accepted

## Context

Shared expense calculations must survive repeated edits, imports, payments, and reversals. JavaScript
`number` values are IEEE-754 doubles, so `0.1 + 0.2` cannot represent exact currency. Floating point
also makes allocation totals drift as soon as a split is recalculated.

## Decision

Every persisted monetary value is an integer count of currency minor units. PostgreSQL uses `BIGINT`
and the application uses `bigint`. The public JSON representation is a decimal string. User input is
parsed with a decimal-string parser; `parseFloat` and arithmetic on `Number` are not allowed in the
money path.

The currency registry stores precision explicitly. INR, USD, EUR, and GBP use two decimals, JPY uses
zero, and KWD uses three. A transaction cap of 1,000,000,000,000 minor units keeps every value below
the `Number.isSafeInteger` boundary used only for display formatting.

## Consequences

- Allocations, balances, and transfer totals can be proven to reconcile exactly.
- Every API and database boundary must serialize BigInt as a string.
- Display formatting is isolated to one tested function.
