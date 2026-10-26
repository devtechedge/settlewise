# Architecture

Settlewise is a structured Next.js monolith with explicit boundaries.

```text
src/
  app/                 routes, server components, server actions, API handlers
  components/          ledger UI, split editor, import workspace, accessible forms
  domain/
    money/             currency registry, exact parsing, formatting
    expenses/          allocation rules
    settlement/        signed balances and transfer planning
  services/            authorized business operations and transactions
  repositories/        tenant-scoped reads and ledger assembly
  importers/           bounded CSV parser, normalization, fingerprints
  validation/          request schemas and shared contracts
  auth/                sessions, passwords, RBAC, invitations, rate limits
  db/                  Drizzle schema, pool, transaction helpers
  lib/                 error codes, API envelopes, shared UI helpers
  env.ts               runtime environment parsing
  middleware.ts        cookie-presence route guard
tests/
  unit/                pure arithmetic, parser, and middleware tests
  integration/         Postgres-backed service and API route tests
e2e/                   Playwright journeys, accessibility, responsive checks
scripts/               migration, test database setup, seed, smoke, QA utilities
```

## Request path

Browser forms and client panels call either server actions or `/api/*` handlers. Both call the same
services. A service resolves the session, membership, and role, then performs one transaction where
money changes. The service calls pure domain functions for allocation, balance, and settlement.
Repositories assemble tenant-scoped rows; they do not decide permissions.

## Data model

Groups are the tenant. Users have memberships and roles. Participants are group-scoped ledger identities
and may or may not have a user account. Expenses have splits, revisions, and optional import provenance.
Settlement payments have idempotency keys and linked reversals. Imports have batches and rows. Budgets,
audit events, and export records complete the operational trail.

Money is `BIGINT` minor units. Composite foreign keys verify that an expense currency matches its group
and that payer, recipient, and split participants belong to the same group. Indexes cover group/date,
group/category, group/payer, status, fingerprint, and audit time.

## State and caching

All pages are dynamic. Monetary state is derived from persisted rows on each request. The only browser
state is theme preference and form input. No CDN-cached balance exists.

## Performance

Two probes make the numbers reproducible rather than asserted:

```bash
npm run db:setup-test && npm run db:seed:test
npm run build && npm run start -- -p 3100
npm run perf:test          # 200- and 800-expense ledgers against the test database
QA_BASE_URL=http://localhost:3100 npm run qa:bundle
```

Measured on this machine with a local Postgres 17 container:

| Operation, 200 expenses and 6 participants | Time |
| --- | --- |
| Write all expenses through the service layer (one transaction each) | 1442 ms |
| Net balances from the ledger | 16 ms |
| Group overview read | 48 ms |
| Reports for the current month | 48 ms |
| CSV export | 27 ms |
| Expense list, first and last page | 5 ms / 4 ms |
| Filtered expense list | 4 ms |

At 800 expenses the same reads stay under 110 ms (balances 74 ms, overview 89 ms, reports 103 ms,
export 98 ms). The cost grows with the ledger, not with the page count, because every read derives from
indexed group-scoped rows.

First visit, gzip on the wire, each page measured in a fresh browser context:

| Route | JS | CSS | Fonts | Total |
| --- | --- | --- | --- | --- |
| `/` | 140 kB | 8 kB | 153 kB | 310 kB |
| `/login` | 138 kB | 8 kB | 120 kB | 271 kB |
| Group expenses | 137 kB | 8 kB | 128 kB | 285 kB |
| Group settlements | 141 kB | 8 kB | 162 kB | 323 kB |

Per-route JavaScript is flat (136-142 kB), so no single screen carries a disproportionate bundle. Fonts
dominate the first visit and are cached immutably afterwards.

## Deployment

Vercel runs the Next.js app, which talks to a managed Neon Postgres database. Migrations are applied from
the repository before a deployment is promoted. Demo data is seeded only into the explicitly designated
demo database. The full runbook is in [`DEPLOYMENT.md`](DEPLOYMENT.md).
