## What changes

One or two sentences describing the product behaviour that moved.

## Why

The user-visible or correctness reason. Link the issue with `Closes #`.

## How to verify

```bash
npm run lint
npm run typecheck
npm test
npm run db:setup-test
npm run test:integration
npm run build
npm run e2e
```

- [ ] Every gate above passes locally
- [ ] New behaviour is covered by a test that fails without the change
- [ ] Money paths still use integer minor units
- [ ] Any new write is authorized server-side, not only hidden in the UI

## Notes for the reviewer

Screenshots for visual changes. Call out anything that touches `src/db/schema.ts`, because it needs a
generated migration and a replay against a clean database.

## Data safety

Do not attach real ledger exports, participant names, session tokens, invitation links, or connection
strings. Use `public/samples/` fixtures or synthetic values instead.
