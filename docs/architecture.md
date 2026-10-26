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
  scripts/             migration, reset, seed, QA utilities
  tests/
    unit/              pure arithmetic and parser tests
    integration/       Postgres-backed service tests
  e2e/                 Playwright journeys, accessibility, responsive checks
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

## Deployment

Vercel runs the Next.js app. Neon PostgreSQL stores data. Migrations are applied from the repository
before a deployment is promoted. Demo data is seeded only into the explicitly designated demo database.
