# ADR 0007: Hashed opaque sessions and server-side group authorization

Date: 2026-10-25
Status: accepted

## Context

The application needs real accounts, expiring invitations, and cross-group isolation without adding an
identity provider dependency. Token leakage and client-side role checks are the main risks.

## Decision

Passwords use scrypt with a per-user salt. Sessions use a 32-byte random bearer token. Only the SHA-256
hash of the token is stored. The cookie is HttpOnly, SameSite=Lax, Secure in production, path-scoped to
the app, and expires with the session after 30 days.

Every mutation performs these checks on the server:

1. resolve the session and reject disabled or anonymized accounts;
2. resolve the requested group through an active membership;
3. compare the membership role with the action's minimum role;
4. verify the group is active for writes;
5. scope every query by group ID and use composite foreign keys so a participant from another group cannot be attached to an expense or payment.

Cookie-authenticated JSON mutations also require a same-origin `Origin` header. Login, signup, demo entry,
invitation acceptance, imports, profile changes, and account deletion use database-backed fixed-window rate
limits keyed by hashed IP or user ID.

## Consequences

- A database token dump cannot replay bearer tokens directly.
- Role changes take effect on the next request.
- There is no email verification or password reset in this release; those flows require an email provider
  and are listed as known limitations.
