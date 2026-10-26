---
name: Bug report
about: Report behaviour that differs from the documented ledger rules
title: ""
labels: bug
assignees: ""
---

## What happened

Describe the actual behaviour, then the behaviour you expected.

## Steps to reproduce

1. Sign in to the public demo, or create a fresh group locally
2. ...
3. See ...

A path that reproduces against the seeded demo group or a fixture in `public/samples/` is enough.

**Do not attach real ledger data.** No live exports, participant names from a real group, session
cookies, invitation tokens, or connection strings. Describe the shape of the data instead, or use
synthetic values.

## Numbers, if money is involved

| Field | Value |
| --- | --- |
| Currency | |
| Amount as entered | |
| Amount displayed | |
| Split method | |
| Participant count | |

## Environment

- Deployed site or local build:
- Browser and version:
- Viewport width:

## Checks already run

- [ ] `npm test`
- [ ] `npm run db:setup-test && npm run test:integration`
- [ ] `npm run e2e`
