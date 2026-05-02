# E2E Tests

V22 feature flag rollout tests using Playwright.

## Test Files

| File                             | Coverage                 |
| -------------------------------- | ------------------------ |
| `v22-feature-flag.spec.ts`       | Feature flags, rollout % |
| `v22-multi-wallet.spec.ts`       | Wallet switching         |
| `v22-bundle-sharing.spec.ts`     | Owner/visitor modes      |
| `v22-core-functionality.spec.ts` | Dashboard, charts        |
| `v22-mobile-responsive.spec.ts`  | Mobile/tablet            |

## Running

```bash
pnpm test:e2e
pnpm test:e2e -- --ui
pnpm exec playwright test tests/e2e/v22-feature-flag.spec.ts
```

## Test IDs

See `DATA_TESTID_GUIDE.md` for `data-testid` attributes.
