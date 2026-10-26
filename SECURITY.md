# Security model

Settlewise is a shared-expense record and settlement planner. It does not process payments, connect to
banks, or store card or bank credentials.

## Trust boundaries

- Untrusted: account credentials, group names, descriptions, notes, participant names, CSV bytes, filenames,
  invitation tokens, session tokens, and export filters.
- Trusted after validation: server-side session resolution, role checks, monetary parsing, allocation
  calculations, database transactions, and audit writes.
- Out of scope: receipt file storage, email delivery, bank APIs, payment initiation, and multi-currency conversion.

## Main threats and controls

| Threat | Control |
| --- | --- |
| Cross-group data access | Active membership check plus group-scoped queries and composite foreign keys |
| Privilege escalation | Minimum role enforced in services and API handlers, not UI only |
| Session theft | HttpOnly, SameSite=Lax, Secure cookies; only SHA-256 token hashes stored; expiry and revocation |
| Password guessing | scrypt hashes and fixed-window IP/account rate limits |
| Account enumeration | Generic sign-in failure; registration collision disclosed only after IP rate limiting and documented as residual risk |
| Invitation theft | 32-byte random token, hash-only storage, expiry, email binding, revocation, one-time acceptance |
| Stale or concurrent writes | Revision preconditions and serializable payment transactions |
| Duplicate payment submission | Unique group idempotency key and payload comparison |
| Import abuse | 2 MB, 2,000 rows, 60 columns, 10,000 characters per cell; preview expiry; creator-only commit; atomic revalidation |
| Malicious CSV | Parser treats all values as text, rejects NUL/control sequences in names and notes, and never fetches URLs |
| Stored XSS | React escaping; no HTML rendering of names, descriptions, notes, or metadata |
| CSV formula injection | Export text beginning with `=`, `+`, `-`, `@`, tab, or CR is prefixed with an apostrophe |
| Oversized or negative money | Strict decimal-string parser, nonnegative split validation, positive expense/payment checks, 1e12 minor-unit cap |
| Currency confusion | One canonical group currency enforced by composite foreign key; no silent conversion |
| Unauthorized deletion | Owner-only archive/delete, exact name confirmation, export guidance, and account ownership preconditions |
| Secret logging | Responses and public logs omit session tokens, invitation tokens, passwords, and full financial payloads |

## Content Security Policy

Production sends CSP with self-only defaults, no frames, no third-party scripts, and same-origin forms and
connections. Next.js bootstrap requires inline script and style execution; `unsafe-eval` is enabled only in
development. The application does not embed remote receipt URLs.

## Known residual risks

- No email verification or password reset. Losing a password requires account recreation and group exports.
- The demo deployment uses a shared fictional account and is not suitable for real personal financial data.
- Import row provenance is retained until group deletion because it explains committed ledger records.
- Rate limits are database-backed fixed windows and do not replace network-level abuse protection.
- A deployment operator with database access can read stored ledger data; hosting credentials are outside the
  application's protection model.

## Reporting

Open a private report through the repository's GitHub Security Advisories rather than a public issue. Do not
include real participant financial data in a report.
