# ADR 0003: Signed net balances are derived, never cached

Date: 2026-10-25
Status: accepted

## Context

A balance can mean amount paid, amount consumed, amount owed, or amount settled. Mixing these makes
a correction impossible to audit. Caching a balance separately from transactions risks drift after an
edit, void, or reversal.

## Decision

For every active expense, the payer receives `+amount` and each split participant receives
`-allocated`. For every recorded settlement payment, the sender receives `+amount` and the recipient
receives `-amount`. A positive net balance means the participant is owed; a negative balance means
they owe. The sum of all participant balances must be exactly zero.

Voided expenses and both sides of a reversed payment are excluded from effective balances but remain
in history. Balances are calculated from the canonical ledger on each request. No materialized balance
cache is used.

## Consequences

- Corrections and reversals immediately affect the plan without cache invalidation.
- Reads are bounded by indexed group queries and are suitable for the expected group sizes.
- Any future aggregate must carry a tested reconciliation path before it can replace this derivation.
