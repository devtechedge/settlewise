# Deployment runbook

This document reproduces the exact steps that put Settlewise into production. It contains no
credentials. Placeholders are written as `$NAME`; they are read from the local shell or from the
project `.env` file and are never committed.

## 1. Local database

```bash
docker run -d --name settlewise-pg \
  -e POSTGRES_USER=settlewise \
  -e POSTGRES_PASSWORD=settlewise_local_pw \
  -e POSTGRES_DB=settlewise_dev \
  -p 5433:5432 postgres:17

cp .env.example .env
npm ci
npm run db:migrate          # applies drizzle/ in order against DATABASE_URL_UNPOOLED
npm run db:setup-test       # recreates settlewise_test and replays every migration
npm run db:seed:dev         # guarded: requires a database name ending in _dev
npm run dev
```

`scripts/migrate.ts` prints the target database name and host before applying anything, so a
mistaken connection string is visible before it can do damage.

## 2. Production database (Neon)

The production schema lives in a dedicated Neon Postgres database named `settlewise`, separate from
every other project on the same Neon instance.

```bash
# One-time database creation, run against a Neon connection that may create databases.
psql "$NEON_ADMIN_URL" -c "create database settlewise"

# Schema, from the repository, against the direct (unpooled) connection.
DATABASE_URL_UNPOOLED="$NEON_DIRECT_URL" npm run db:migrate
```

Verify the replay rather than trusting the command's exit code:

```bash
psql "$NEON_DIRECT_URL" -c "select schema, version from drizzle.__drizzle_migrations order by id"
psql "$NEON_DIRECT_URL" -c "select count(*) from pg_tables where schemaname = 'public'"
```

Three migration rows and sixteen public tables are the expected result for this release. Pooler and
direct hosts differ: migrations and the test suite use the direct host, the application uses the
pooler host.

## 3. Vercel project and Git link

The project-create endpoint available to this token rejects an inline `gitSource`, so the project was
created empty and then linked:

```bash
curl -X POST "https://api.vercel.com/v13/projects?teamId=$TEAM_ID" \
  -H "Authorization: Bearer $VERCEL_TOKEN" -H "content-type: application/json" \
  -d '{"name":"settlewise","framework":"nextjs","buildCommand":"next build","installCommand":"npm ci"}'

curl -X POST "https://api.vercel.com/v9/projects/settlewise/link?teamId=$TEAM_ID" \
  -H "Authorization: Bearer $VERCEL_TOKEN" -H "content-type: application/json" \
  -d '{"repo":"devtechedge/settlewise","type":"Application","productionBranch":"main"}'
```

Confirm the link and the alias:

```bash
curl -H "Authorization: Bearer $VERCEL_TOKEN" "https://api.vercel.com/v9/projects/settlewise?teamId=$TEAM_ID"
```

The project resolves to `settlewise-psi.vercel.app`.

## 4. Environment variables

| Key | Vercel type | Targets |
| --- | --- | --- |
| `DATABASE_URL` | `sensitive` | production, preview |
| `DATABASE_URL_UNPOOLED` | `sensitive` | production, preview |
| `APP_URL` | `plain` | production, preview |
| `NEXT_TELEMETRY_DISABLED` | `plain` | production, preview |

```bash
curl -X PUT "https://api.vercel.com/v10/projects/settlewise/env?teamId=$TEAM_ID" \
  -H "Authorization: Bearer $VERCEL_TOKEN" -H "content-type: application/json" \
  -d '{"key":"DATABASE_URL","value":"'"$NEON_POOLER_URL"'","type":"sensitive","target":["production","preview"]}'
```

`type` accepts `plain`, `secret`, `system`, and `sensitive`. `sensitive` is used here so the value is
write-only in the dashboard and API. Sensitive values cannot be read back through the API, which is
why a wrong value is diagnosed with a failed migration or a health check rather than a `GET`.

## 5. Production seed

Seeding the live demo ledger is deliberately hard to do by accident:

```bash
ALLOW_PROD_SEED=1 DATABASE_URL="$NEON_DIRECT_URL" npm run db:seed
```

`scripts/seed.ts` refuses to run unless `ALLOW_PROD_SEED=1` is set and the connection targets the
database named exactly `settlewise`. It also stops if any user row already exists, so a seeded demo
can never be doubled by a second run; re-seeding means creating a fresh database. The `--dev` and
`--test` flags apply the same style of guard to `*_dev` and `*test*` databases.

## 6. Deploy, poll, and verify

Pushing to `main` starts a build. Poll until the deployment is ready:

```bash
curl -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v6/deployments?limit=1&app=settlewise&teamId=$TEAM_ID"
```

Read `.deployments[0].uid`, `.readyState`, and `.meta.githubCommitRefSha`. Treat only `READY` as
deployed; `ERROR` and `QUEUED` are not evidence. Then probe the running app:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://settlewise-psi.vercel.app/api/health
curl -s -D - -o /dev/null https://settlewise-psi.vercel.app/groups/00000000-0000-0000-0000-000000000000
curl -sI https://settlewise-psi.vercel.app/ | grep -i "strict-transport-security\|content-security-policy"
curl -s https://settlewise-psi.vercel.app/robots.txt
curl -s https://settlewise-psi.vercel.app/sitemap.xml
```

Expected: health `200`, an unauthenticated group page `307` to `/login?next=...`, `HSTS` and a full
CSP on the document response, and a XML sitemap listing the public routes.

## 7. Smoke test

```bash
SMOKE_BASE_URL=https://settlewise-psi.vercel.app npm run smoke
```

`scripts/smoke.ts` drives a real Chromium browser against the target origin: signup, group creation,
participant, expense, correction to revision 2, payment, reversal, the balance-sum invariant,
cross-account isolation, health, the exact-name deletion guard, and finally deletion of its own group
with a `404` confirmation afterwards. It writes only to throwaway accounts and removes the group it
created, so repeated runs do not accumulate demo data in production.

## 8. Rollback

1. `git revert` the offending commit and push to `main`; Vercel builds the previous behavior.
2. If the schema is involved, restore forward-only: generate a new migration that undoes the change.
   Drizzle migrations here are never edited after they exist.
3. Neon retains an instant-restore point; use it only when data is actively corrupt, because it
   rewinds every group, not just the affected one.
4. Re-run `npm run smoke` and the health probe after any rollback.

## 9. Branch protection

`main` requires a passing `quality` check, no force pushes, and no deletions:

```bash
gh api -X PUT "repos/devtechedge/settlewise/branches/main/protection" \
  -H "Accept: application/vnd.github+json" \
  -f 'required_status_checks[strict]=true' \
  -f 'required_status_checks[contexts][]=quality' \
  -F 'required_pull_request_reviews.required_approving_review_count=0' \
  -f 'enforce_admins=false' \
  -f 'restrictions=null'
```

Rulesets were tried first and rejected the payload on this plan; the legacy branch-protection
endpoint is what is actually in force. Verify with `gh api repos/devtechedge/settlewise/branches/main/protection`.
