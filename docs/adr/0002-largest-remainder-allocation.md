# ADR 0002: Largest-remainder allocation with participant-ID tie-breaking

Date: 2026-10-25
Status: accepted

## Context

A total in minor units rarely divides evenly among beneficiaries. Rounding each share independently
can leave a residual, while forcing one beneficiary to absorb the remainder creates an order-dependent
result that is hard to explain.

## Decision

All four supported methods produce integer allocations that sum exactly to the expense total:

- EQUAL: base share is `floor(total / n)`. Residual units go to the first beneficiaries by ascending participant ID.
- EXACT: entered shares must sum to the total. No residual is permitted.
- PERCENT: percentages are integer basis points summing to 10,000. Shares use `floor(total * bp / 10000)`, then residual units go to the largest fractional remainders, ties by ascending participant ID.
- SHARES: positive integer weights use `floor(total * weight / totalWeight)`, then the same largest-remainder rule.

The result includes the residual amount, recipients, and a human-readable rule. The browser preview and server use the same pure function, and the server recomputes before persistence.

## Consequences

- The same participant IDs and total always produce the same split.
- A beneficiary's share can differ by one minor unit based on stable ID order.
- The UI must explain the residual rather than hide it.
