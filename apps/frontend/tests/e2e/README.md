# V22 Feature Flag Rollout - E2E Test Suite

Comprehensive E2E test coverage for the V22 layout migration feature flag rollout system.

## Overview

This test suite validates the percentage-based rollout of the V22 portfolio layout, ensuring
seamless transitions between V1 and V22 layouts based on feature flags, multi-wallet functionality,
bundle sharing, and mobile responsiveness.

## Test Files

| Test File                        | Coverage                                                              | Run                                                                  |
| -------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `v22-feature-flag.spec.ts`       | Feature flags, rollout %, hash-based assignment, V1/V22 routing       | `pnpm exec playwright test tests/e2e/v22-feature-flag.spec.ts`       |
| `v22-multi-wallet.spec.ts`       | Wallet switcher, URL params `?walletId=X`, cross-layout compatibility | `pnpm exec playwright test tests/e2e/v22-multi-wallet.spec.ts`       |
| `v22-bundle-sharing.spec.ts`     | Owner/visitor modes, shared links `/bundle?userId=X`, switch banner   | `pnpm exec playwright test tests/e2e/v22-bundle-sharing.spec.ts`     |
| `v22-core-functionality.spec.ts` | Dashboard, regime cards, tabs, composition bar, quick actions         | `pnpm exec playwright test tests/e2e/v22-core-functionality.spec.ts` |
| `v22-mobile-responsive.spec.ts`  | iPhone SE, iPad, desktop, touch targets, responsive breakpoints       | `pnpm exec playwright test tests/e2e/v22-mobile-responsive.spec.ts`  |

---

## Test Execution

### Run All V22 Tests

```bash
# Run entire V22 test suite
pnpm exec playwright test tests/e2e/v22-*.spec.ts

# Run with UI mode for debugging
pnpm exec playwright test tests/e2e/v22-*.spec.ts --ui

# Run specific test file
pnpm exec playwright test tests/e2e/v22-feature-flag.spec.ts

# Run tests in headless mode (CI/CD)
pnpm exec playwright test tests/e2e/v22-*.spec.ts --headed=false
```

### Debug Individual Tests

```bash
# Debug mode (pauses on failure)
pnpm exec playwright test tests/e2e/v22-feature-flag.spec.ts --debug

# Slow motion (easier to see what's happening)
pnpm exec playwright test tests/e2e/v22-core-functionality.spec.ts --slow-mo=500

# Run specific test case
pnpm exec playwright test tests/e2e/v22-feature-flag.spec.ts -g "should show V22 layout when flag is ON"
```

### CI/CD Integration

```bash
# Run with retries (recommended for CI)
pnpm exec playwright test tests/e2e/v22-*.spec.ts --retries=2

# Generate HTML report
pnpm exec playwright test tests/e2e/v22-*.spec.ts --reporter=html

# Single worker for memory-constrained environments
pnpm exec playwright test tests/e2e/v22-*.spec.ts --workers=1
```

---

## Test Configuration

### Environment Variables

```env
NEXT_PUBLIC_USE_V22_LAYOUT=true
NEXT_PUBLIC_V22_ROLLOUT_PERCENTAGE=50
# Optional: NEXT_PUBLIC_ENABLE_RQ_DEVTOOLS=1
```

### Playwright Config

- **Base URL**: `http://localhost:3000`
- **Workers**: 1 (memory optimization)
- **Timeout**: 30s per test
- **Retries**: 2 on CI, 0 locally

---

## Data-TestID Attributes

### Required Test IDs

Many tests rely on `data-testid` attributes for reliable element selection. See
`DATA_TESTID_GUIDE.md` for implementation details.

**Critical Test IDs:**

- `wallet-switcher-button` - Wallet switcher dropdown trigger
- `wallet-switcher-dropdown` - Wallet selection dropdown
- `wallet-option-${address}` - Individual wallet options
- `active-wallet-indicator` - Zap icon for active wallet
- `settings-button` - Settings modal trigger
- `wallet-manager-button` - Wallet manager modal trigger
- `deposit-button`, `withdraw-button`, `optimize-button` - Quick actions
- `strategy-card` - Current strategy card
- `regime-spectrum` - Regime spectrum (when expanded)
- `composition-bar` - Portfolio composition visualization
- `switch-prompt-banner` - Bundle sharing switch banner
- `stay-button`, `switch-button` - Banner actions
- `v1-sidebar` - V1 layout sidebar (for comparison tests)
- `wallet-metrics-container` - V1 metrics component

### Adding Test IDs

1. Add `data-testid` to key elements in component files
2. Use `kebab-case` naming
3. Include ARIA attributes for accessibility

**Example:**

```tsx
<button data-testid="wallet-switcher-button" aria-expanded={showWalletSwitcher}>
  {connectedWallets.length} Wallets
</button>
```

---

## Test Routes

### Production Routes

- `/bundle?userId=<address>` - Bundle page (feature flag determines V1/V22)
- `/bundle?userId=<address>&walletId=<id>` - Multi-wallet bundle

### Demo Routes (Always V22)

- `/layout-demo/v22` - V22 layout with mock data
- `/layout-demo/v22?userId=<address>` - V22 with specific user

---

## Test Data

### Test User IDs

- `0x1111111111111111111111111111111111111111` - Hash % 100 = 45 (V1 at 50%)
- `0x2222222222222222222222222222222222222222` - Hash % 100 = 90 (V22 at 50%)
- `0x1234567890abcdef1234567890abcdef12345678` - Generic test user

### Wallet IDs

- `wallet-primary` - Primary wallet
- `wallet-secondary` - Secondary wallet

---

## Coverage Summary

| Test File                        | Test Cases | Coverage Areas                                |
| -------------------------------- | ---------- | --------------------------------------------- |
| `v22-feature-flag.spec.ts`       | ~25        | Feature flags, routing, layout differences    |
| `v22-multi-wallet.spec.ts`       | ~30        | Wallet switching, URL params, persistence     |
| `v22-bundle-sharing.spec.ts`     | ~35        | Owner/visitor modes, shared links, banner     |
| `v22-core-functionality.spec.ts` | ~40        | Dashboard, tabs, charts, interactions         |
| `v22-mobile-responsive.spec.ts`  | ~35        | Mobile, tablet, desktop, touch, accessibility |
| **Total**                        | **~165**   | **All critical V22 migration paths**          |

---

## Known Issues & Workarounds

### 1. Wallet Connection in Tests

**Issue:** E2E tests cannot easily simulate wallet connection (wagmi injected connector)
**Workaround:** Tests use demo route `/layout-demo/v22` which doesn't require wallet

### 2. Feature Flag Environment Variables

**Issue:** Tests cannot dynamically change env vars during runtime **Workaround:** Use different
routes (`/bundle` for production, `/layout-demo/v22` for forced V22)

### 3. Memory Constraints in CI

**Issue:** Playwright can consume significant memory with parallel tests **Workaround:**
`playwright.config.ts` uses `workers: 1` and disabled traces/videos

### 4. Flaky Network Tests

**Issue:** API calls can cause flaky tests if timing varies **Workaround:** Use
`waitForLoadState("networkidle")` and generous timeouts

---

## Best Practices

1. **Use data-testid over CSS selectors**
   - More stable across design changes
   - Clearer intent in tests

2. **Wait for network idle**
   - Always use `await page.waitForLoadState("networkidle")`
   - Prevents race conditions

3. **Test user flows, not implementation**
   - Focus on what users see and do
   - Avoid testing internal state

4. **Handle both success and failure states**
   - Test happy paths and error scenarios
   - Mock API failures with `page.route()`

5. **Make tests deterministic**
   - Use fixed test data (user IDs, wallet IDs)
   - Hash-based rollout ensures consistent results

6. **Keep tests isolated**
   - Each test should run independently
   - Use `test.beforeEach()` for setup

---

## Maintenance

### Adding New Tests

1. Create new test file following naming convention: `v22-<feature>.spec.ts`
2. Add to this README with coverage summary
3. Include in CI/CD pipeline
4. Update test count in Coverage Summary table

### Updating Existing Tests

1. Keep test descriptions clear and up-to-date
2. Update DATA_TESTID_GUIDE.md if adding new test IDs
3. Run full suite before committing: `pnpm test:e2e`
4. Update this README if coverage changes

---

## Troubleshooting

| Issue                             | Solution                                                                 |
| --------------------------------- | ------------------------------------------------------------------------ |
| Tests pass in CI but fail locally | Check Node version; clear Playwright cache; ensure dev server is running |
| Timeouts                          | Increase timeout in config; check network; use `--slow-mo`               |
| Elements not found                | Verify `data-testid` exists; check visibility                            |
| Wallet switcher fails             | Ensure multi-wallet enabled; check `hasMultipleWallets` returns true     |

---

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Next.js Testing Guide](https://nextjs.org/docs/testing)
- [Feature Flag Implementation](../../src/config/featureFlags.ts)
- [V22 Component](../../src/components/wallet/variations/WalletPortfolioPresenterV22.tsx)
- [Bundle Page Entry](../../src/app/bundle/BundlePageEntry.tsx)

---

**Last Updated:** 2025-12-16 **Test Suite Version:** 1.0 **Total Test Cases:** ~165 **Estimated Run
Time:** 5-8 minutes (single worker)
