# Product spec

## Who it is for

| Persona | Situation | What they need | What they explicitly do not get |
| --- | --- | --- | --- |
| Household owner | Rent, groceries, and utilities are shared by two to six people with one card doing most of the paying | One authoritative balance per person, and a defensible explanation of how it was reached | Bank feeds, automatic charging, or a suggestion that Settlewise has seen anyone's real money |
| Trip or flatmate organizer | Costs arrive from a group chat and a card export, weeks after the fact | A CSV import that shows its work before it writes anything | Silent row creation, fuzzy matching, or a "close enough" total |
| Editor without ownership | A partner or roommate who is allowed to keep the books but not to change who is in the group | Transaction rights without membership rights | Invitations, role changes, ownership transfer, group deletion |
| Member who only reads their own balance | Someone who wants to know what they owe and nothing else | Their own position and the right to log their own repayment | Editing anyone else's expense or recording a payment between two other people |
| Auditor in the household | The person who asks "why did this number change?" | Append-only revisions, named reasons, and an audit trail they can read | The ability to rewrite history |

## Journeys

1. **First group.** Sign up → create group (name, currency, optional monthly budget) → add participants
   → record the first equal split → see balances move. Proven by `e2e/owner-journey.spec.ts`.
2. **Correcting a mistake.** Open an expense → Correct → change the amount with a reason → the ledger
   keeps revision 1 and adds revision 2. A second client holding revision 1 is rejected with a stale
   message instead of overwriting. Proven by `tests/integration/ledger-lifecycle.test.ts` and
   `tests/integration/api-routes.test.ts`.
3. **Settling up.** Settlements tab → suggested transfers → record a payment → reverse it with a reason
   → the reversal appears as its own compensating record and balances return. Proven by the owner
   journey and the payment tests in `ledger-lifecycle`.
4. **Importing a card export.** Upload CSV → preview (nothing is written) → map payer and beneficiary
   columns by name → re-preview → duplicates are detected by fingerprint → commit a policy (skip or
   import anyway) → committed rows are visible as ordinary expenses with provenance. Proven by
   `tests/integration/imports-exports.test.ts`, `e2e/import-mapping.spec.ts`, and the owner journey.
5. **Handing over.** Owner transfers ownership to an active member. If that member has no ledger
   identity yet, one is created in the same transaction, so the new owner can immediately record their
   own spend. Proven by `tests/integration/access-control.test.ts`.
6. **Leaving.** A member is removed and their participant becomes inactive; expenses they paid stay in
   the ledger. An account can only be deleted after its owned groups are resolved, after which identity
   is anonymized and financial rows are retained for the other members. Proven by the account deletion
   test.

## State matrix

Every screen that touches money renders all of these; none is a dead control.

| State | Trigger | What the user sees |
| --- | --- | --- |
| Loading | Route or server action pending | `loading.tsx` skeleton, no fake numbers |
| Empty | New group, no participants, no rows | Specific next action, not a blank table |
| Invalid input | Amount precision, bad date, missing split | Field-level message, values preserved |
| Denied | Non-member URL, or role below the requirement | The same 404 as a missing record, never a leaked name |
| Stale | Revision moved underneath the form | Conflict message with the current revision, edit preserved |
| Duplicate | Fingerprint match on import | Counted as duplicate and skipped unless the policy says otherwise |
| Rounding | Split that does not divide evenly | Largest-remainder allocation with a visible residual note |
| Success | Any write | Server-confirmed text, and the ledger re-read from Postgres |
| Recoverable failure | Rate limit, archived group, expired preview | The reason and the way back, not a stack trace |

## Permissions

Server-side only; the UI hides what the service would reject anyway.

| Action | MEMBER | EDITOR | OWNER |
| --- | --- | --- | --- |
| Read ledger, balances, settlement plan, reports, audit | yes | yes | yes |
| Record a payment | own participant only | any | any |
| Reverse a payment | — | own records, any as owner | any |
| Create, correct, void an expense | no | yes | yes |
| Add or deactivate participants | no | yes | yes |
| Set monthly and category budgets | no | yes | yes |
| Preview or commit a CSV import, export CSV | no | yes | yes |
| Invite, revoke invitation | no | no | yes |
| Change a member's role, remove a member | no | no | yes |
| Transfer ownership, archive, restore, delete the group | no | no | yes |

Archiving blocks every write but leaves reads intact. Deleting a group requires typing the exact group
name and cascades its rows.

## Intentional exclusions

- No payment processing, bank connectivity, or money movement of any kind.
- No email delivery. Invitation links are shown to the inviter to forward.
- No password recovery. This is a deliberate scope decision for this release, not an oversight.
- One currency per group; no exchange-rate history or conversion.
- No receipt or attachment storage.
- No globally minimal transfer plan: the planner is greedy and deterministic, which is a stronger
  guarantee for reproducibility than optimality is for savings.

## Acceptance evidence

- Unit: currency parsing, precision rejection, minor-unit cap, allocation residual, percentage basis
  points, shares, settlement determinism, CSV bounds, middleware guards.
- Integration: revisions and stale conflicts, idempotent payments, reversals, cross-group rejection,
  composite currency FK, import preview/commit/duplicate/expiry, formula escaping, invitations,
  ownership, archiving, account and group deletion, API error envelopes.
- Browser: the full owner journey including import and export, manual CSV mapping request bodies, demo
  ledger figures, authorization and session behaviour, axe scans at two viewports, and overflow checks.
- Production: `scripts/smoke.ts` plus the probes in [`DEPLOYMENT.md`](DEPLOYMENT.md).
