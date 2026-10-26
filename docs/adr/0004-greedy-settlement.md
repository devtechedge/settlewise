# ADR 0004: Deterministic greedy settlement without a minimality claim

Date: 2026-10-25
Status: accepted

## Context

Listing every original obligation is explainable but noisy. Minimum-transfer settlement is a subset-sum
style optimization whose proof and performance are not appropriate for the first release. A plan that
silently claims optimality would be misleading.

## Decision

The planner sorts debtors and creditors by outstanding amount descending, then by ascending participant
ID. It repeatedly matches the current largest debtor with the current largest creditor and transfers
`min(debt, credit)`. Before each transfer it records the sender's and recipient's current signed
balances as the basis.

The planner verifies that:

- all net balances sum to zero;
- total debtor value equals total creditor value;
- total proposed transfer value equals both sides;
- no transfer exceeds an outstanding balance.

The output is labeled "Suggested settlement plan". Documentation states that greedy matching reduces
transfers compared with listing every expense but does not claim a globally minimum transfer count for
every possible ledger.

## Consequences

- Identical ledgers produce identical plans.
- The plan is easy to explain row by row.
- Future optimization work must prove its scope and add comparison tests before changing this label.
