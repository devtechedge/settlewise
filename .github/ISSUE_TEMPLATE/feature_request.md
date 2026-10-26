---
name: Feature request
about: Propose a change to ledger, import, settlement, or access behaviour
title: ""
labels: enhancement
assignees: ""
---

## The problem in one paragraph

Who hits it, when, and what they do instead today.

## Proposed behaviour

What changes on screen, what the API returns, and what gets persisted.

## Money and correctness questions

- [ ] Changes an amount, split, balance, or settlement plan
- [ ] Changes what an import accepts or how it deduplicates
- [ ] Changes who is allowed to do what
- [ ] None of the above

If any box is checked, name the invariant that must still hold. Balances always sum to zero, splits
always total the expense exactly, and history is never rewritten.

## Out of scope for this project

Payment processing, bank connectivity, multi-currency conversion inside one group, and receipt storage
are deliberate exclusions. Requests that need them belong elsewhere.

## Acceptance evidence

How would a reviewer know it works? Name the test, journey, or screen that should prove it.
