# V22 Feature Flag Rollout - E2E Test Suite

Comprehensive E2E test coverage for the V22 layout migration feature flag rollout system.

## Overview

This test suite validates the percentage-based rollout of the V22 portfolio layout, ensuring
seamless transitions between V1 and V22 layouts based on feature flags, multi-wallet functionality,
bundle sharing, and mobile responsiveness.

## Test Files

### 1. `v22-feature-flag.spec.ts` - Feature Flag Routing Tests

**Coverage:**

- Master switch control (`NEXT_PUBLIC_USE_V22_LAYOUT`)
- Percentage-based rollout (`NEXT_PUBLIC_V22_ROLLOUT_PERCENTAGE`)
- Deterministic user assignment via hash
- Layout component differences (V1 vs V22)
- Route preservation with URL parameters
- Rollout stability across sessions
- Fallback behavior for edge cases

**Key Test Scenarios:**

- V1 layout when flag is OFF
- V22 layout when flag is ON
- 0% rollout → everyone gets V1
- 100% rollout → everyone gets V22
- 50% rollout → deterministic split based on userId hash
- Same user always sees same layout

**Run:**

```bash
npx playwright test tests/e2e/v22-feature-flag.spec.ts
```

---

### 2. `v22-multi-wallet.spec.ts` - Multi-Wallet Integration Tests

**Coverage:**

- Wallet switcher dropdown UI
- Active wallet indicator (Zap icon)
- Wallet switching triggers portfolio refresh
- URL parameter handling (`?walletId=X`)
- Cross-layout compatibility (V1 and V22)
- Wallet persistence across tab navigation
- Accessibility and keyboard navigation

**Key Test Scenarios:**

- Display all connected wallets in dropdown
- Switch active wallet via UI
- Pre-select wallet from URL parameter
- Wallet state persists when switching tabs
- Dropdown closes on click outside or Escape
- Works in both V1 and V22 layouts

**Run:**

```bash
npx playwright test tests/e2e/v22-multi-wallet.spec.ts
```

---

### 3. `v22-bundle-sharing.spec.ts` - Bundle Sharing Tests

**Coverage:**

- Owner mode (full features: settings, wallet manager)
- Visitor mode (read-only, no wallet required)
- Shared link format (`/bundle?userId=X`)
- Multi-wallet shared link (`/bundle?userId=X&walletId=Y`)
- Switch prompt banner for connected users viewing other bundles
- Banner visibility logic and actions (Stay/Switch)
- Privacy and security (no sensitive data in shared bundles)

**Key Test Scenarios:**

- Owner sees settings and wallet manager
- Visitor sees read-only portfolio
- Shared link loads bundle without authentication
- Multi-wallet link pre-selects correct wallet
- Switch banner appears when connected user views different bundle
- Banner has Stay and Switch buttons
- Bundle data loads correctly in shared mode

**Run:**

```bash
npx playwright test tests/e2e/v22-bundle-sharing.spec.ts
```

---

### 4. `v22-core-functionality.spec.ts` - V22 UI Functionality Tests

**Coverage:**

- Dashboard tab with portfolio data
- Regime detection and strategy display
- Strategy card expand/collapse animation
- Composition bar with allocations (BTC, ETH, ALT, Stables)
- Analytics tab with performance charts
- Backtesting tab with simulation
- Tab navigation (3 tabs: Dashboard, Analytics, Backtesting)
- Quick actions (Deposit, Withdraw, Optimize)
- Loading states and error handling

**Key Test Scenarios:**

- Portfolio balance and ROI display
- Regime badge (EF/F/N/G/EG) and strategy card
- Target allocation and regime spectrum
- Composition bar shows BTC, ETH, ALT, Stables
- Analytics charts render with risk metrics
- Backtesting simulator with profile selector
- Tab navigation preserves data
- Quick actions trigger modals

**Run:**

```bash
npx playwright test tests/e2e/v22-core-functionality.spec.ts
```

---

### 5. `v22-mobile-responsive.spec.ts` - Mobile & Responsive Tests

**Coverage:**

- iPhone SE (375px) - Small mobile
- iPad (768px) - Tablet
- Desktop (1920px) - Large desktop
- Landscape orientations
- Touch interactions (tap to expand, tap to switch tabs)
- Responsive breakpoints (320px to 2560px)
- Content adaptation (condensed vs expanded views)
- Accessibility on mobile (touch targets, contrast, focus)
- Performance on mobile devices

**Key Test Scenarios:**

- No horizontal overflow on small screens
- Wallet switcher fits on mobile
- Navigation readable without overflow
- Touch targets at least 44x44px
- Charts render properly on tablet
- Desktop utilizes full width
- Composition bar scales on mobile
- Text readable at all sizes

**Run:**

```bash
npx playwright test tests/e2e/v22-mobile-responsive.spec.ts
```

---

## Test Execution

### Run All V22 Tests

```bash
# Run entire V22 test suite
npx playwright test tests/e2e/v22-*.spec.ts

# Run with UI mode for debugging
npx playwright test tests/e2e/v22-*.spec.ts --ui

# Run specific test file
npx playwright test tests/e2e/v22-feature-flag.spec.ts

# Run tests in headless mode (CI/CD)
npx playwright test tests/e2e/v22-*.spec.ts --headed=false
```

### Debug Individual Tests

```bash
# Debug mode (pauses on failure)
npx playwright test tests/e2e/v22-feature-flag.spec.ts --debug

# Slow motion (easier to see what's happening)
npx playwright test tests/e2e/v22-core-functionality.spec.ts --slow-mo=500

# Run specific test case
npx playwright test tests/e2e/v22-feature-flag.spec.ts -g "should show V22 layout when flag is ON"
```

### CI/CD Integration

```bash
# Run tests with retries (recommended for CI)
npx playwright test tests/e2e/v22-*.spec.ts --retries=2

# Generate HTML report
npx playwright test tests/e2e/v22-*.spec.ts --reporter=html

# Run with single worker (memory-constrained environments)
npx playwright test tests/e2e/v22-*.spec.ts --workers=1
```

---

## Test Configuration

### Environment Variables (for testing)

```env
# Enable V22 layout
NEXT_PUBLIC_USE_V22_LAYOUT=true

# Set rollout percentage (0-100)
NEXT_PUBLIC_V22_ROLLOUT_PERCENTAGE=50

# Optional: React Query Devtools (uses extra memory; omit or set 0 for lean dev)
NEXT_PUBLIC_ENABLE_RQ_DEVTOOLS=1

# Optional: in-app log viewer overlay in dev (set to 1 only when needed)
# NEXT_PUBLIC_ENABLE_LOG_VIEWER=1
```

### Playwright Config

Tests use the configuration from `/playwright.config.ts`:

- **Test Directory**: `./tests`
- **Test Match**: `/^[^/]+\.spec\.ts$/`
- **Base URL**: `http://localhost:3000`
- **Workers**: 1 (memory optimization)
- **Timeout**: 30 seconds per test
- **Global Timeout**: 10 minutes
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

1. Open component file (e.g., `WalletPortfolioPresenterV22.tsx`)
2. Add `data-testid` attribute to key elements
3. Follow naming convention: `kebab-case` descriptive names
4. Include ARIA attributes for accessibility
5. Verify tests pass with new IDs

**Example:**

```tsx
<button
  data-testid="wallet-switcher-button"
  onClick={() => setShowWalletSwitcher(!showWalletSwitcher)}
  aria-expanded={showWalletSwitcher}
  aria-haspopup="menu"
>
  <Wallet className="w-4 h-4" />
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
3. Run full suite before committing: `npm run test:e2e`
4. Update this README if coverage changes

---

## Troubleshooting

### Tests Fail Locally But Pass in CI

- Check Node.js version (should match CI)
- Clear Playwright cache: `npx playwright install --force`
- Ensure dev server is running: `npm run dev`
- If Playwright exits with `http://localhost:3000 is already used`, stop or move the other process
  using port `3000`, then rerun `npm run test:e2e`

### Tests Timeout Frequently

- Increase timeout in `playwright.config.ts`
- Check network speed (slow API responses)
- Use `--slow-mo` to debug timing issues

### Elements Not Found

- Verify data-testid attributes exist in components
- Check if element is visible: `await expect(element).toBeVisible()`
- Use `page.pause()` to inspect page state during test

### Wallet Switcher Tests Fail

- Ensure multi-wallet feature is enabled
- Check that `hasMultipleWallets` returns true
- Verify dropdown renders with `data-testid="wallet-switcher-dropdown"`

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
