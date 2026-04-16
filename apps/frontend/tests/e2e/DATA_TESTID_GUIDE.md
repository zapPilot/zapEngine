# Data-TestID Implementation Guide for V22 Components

This guide outlines the `data-testid` attributes that should be added to V22 components to support
comprehensive E2E testing.

## Priority: High-Impact Test IDs

These are the most critical data-testid attributes needed for the test suite to function reliably.

### WalletPortfolioPresenterV22.tsx

**Unified Wallet Menu (WalletMenu.tsx):**

The V22 layout uses a unified wallet menu component that adapts to user state (disconnected, single
wallet, multiple wallets).

```typescript
// Main wallet menu button (line ~113)
<button
  data-testid="unified-wallet-menu-button"
  onClick={!isConnected ? handleConnectClick : () => setIsMenuOpen(!isMenuOpen)}
  aria-expanded={isMenuOpen}
  aria-haspopup="menu"
>
  <Wallet className="w-4 h-4" />
  {!isConnected && <span>Connect Wallet</span>}
  {isConnected && account?.address && (
    <span className="font-mono">{formatAddress(account.address)}</span>
  )}
</button>

// Dropdown menu container (line ~151)
<motion.div
  data-testid="unified-wallet-menu-dropdown"
  className="absolute top-full right-0..."
  role="menu"
  aria-label="Wallet menu"
>
  {/* Menu items rendered conditionally based on wallet state */}
</motion.div>
```

**States:**

- **Disconnected**: Button shows "Connect Wallet", triggers wagmi injected connector on click
- **Single Wallet**: Dropdown shows address, balance, menu items (View Bundle, Manage Wallets,
  Settings, Disconnect)
- **Multiple Wallets**: Dropdown shows wallet list with active indicator, switch buttons, and
  "Connect Another Wallet" option

**Settings & Wallet Manager:**

```typescript
// Settings button
<button
  data-testid="settings-button"
  onClick={() => setIsSettingsOpen(true)}
>
  <Settings className="w-5 h-5" />
</button>

// Wallet Manager button
<button
  data-testid="wallet-manager-button"
  onClick={() => setIsWalletManagerOpen(true)}
>
  <Wallet className="w-5 h-5" />
</button>
```

**Quick Actions:**

```typescript
// Deposit button
<GradientButton
  data-testid="deposit-button"
  onClick={() => setActiveModal("deposit")}
>
  <ArrowDownCircle className="w-4 h-4" />
  Deposit
</GradientButton>

// Withdraw button
<GradientButton
  data-testid="withdraw-button"
  onClick={() => setActiveModal("withdraw")}
>
  <ArrowUpCircle className="w-4 h-4" />
  Withdraw
</GradientButton>

// Optimize button
<GradientButton
  data-testid="optimize-button"
  variant="outline"
>
  <Gauge className="w-4 h-4" />
  Optimize
</GradientButton>
```

**Strategy Card:**

```typescript
// Strategy card container
<div
  data-testid="strategy-card"
  onClick={() => setIsStrategyExpanded(!isStrategyExpanded)}
  className="cursor-pointer..."
>
  <h3>Current Strategy</h3>
  // ... content
</div>

// Regime spectrum (when expanded)
<div data-testid="regime-spectrum">
  <h4>Regime Spectrum</h4>
  // ... spectrum visualization
</div>
```

**Portfolio Composition:**

```typescript
// Composition bar container
<div data-testid="composition-bar" className="...">
  <h3>Portfolio Composition</h3>
  // ... composition visualization
</div>

// Individual segments
<div data-testid="composition-btc">BTC {btcPercent}%</div>
<div data-testid="composition-eth">ETH {ethPercent}%</div>
<div data-testid="composition-alt">ALT {altPercent}%</div>
<div data-testid="composition-stables">STABLES {stablesPercent}%</div>
```

**Tab Buttons:**

```typescript
// Tab buttons (already have role="button", add data-testid)
<button
  data-testid={`tab-${tab.id}`}
  key={tab.id}
  onClick={() => setActiveTab(tab.id)}
  role="button"
  aria-label={`${tab.label} tab`}
>
```

### BundlePageClientV22.tsx

**Switch Prompt Banner:**

```typescript
<div data-testid="switch-prompt-banner" className="...">
  <button data-testid="stay-button" onClick={handleStay}>
    Stay on {formatAddress(bundleUserId)}
  </button>

  <button data-testid="switch-button" onClick={handleSwitch}>
    Switch to my bundle
  </button>
</div>
```

### V1 Components (for comparison tests)

**V1 Sidebar:**

```typescript
// WalletPortfolioPresenter.tsx (V1)
<aside data-testid="v1-sidebar" className="...">
  // ... sidebar content with 5 tabs
</aside>

<div data-testid="wallet-metrics-container" className="...">
  // ... WalletMetrics component
</div>
```

## Implementation Checklist

- [ ] Add wallet switcher test IDs to `WalletPortfolioPresenterV22.tsx`
- [ ] Add settings/wallet manager button test IDs
- [ ] Add quick action button test IDs (Deposit, Withdraw, Optimize)
- [ ] Add strategy card and regime spectrum test IDs
- [ ] Add composition bar and segment test IDs
- [ ] Add tab navigation test IDs
- [ ] Add switch prompt banner test IDs to `BundlePageClientV22.tsx`
- [ ] Add V1 sidebar test IDs to `WalletPortfolioPresenter.tsx`
- [ ] Add V1 metrics container test ID
- [ ] Update components to include aria-labels alongside test IDs

## Testing Best Practices

1. **Use data-testid for unique element identification**
   - Prefer `data-testid` over CSS selectors or text content
   - Make test IDs descriptive and unique

2. **Combine with ARIA attributes**
   - Always include proper ARIA labels alongside test IDs
   - Ensure accessibility and testability

3. **Naming Convention**
   - Use kebab-case: `wallet-switcher-button`
   - Be specific: `wallet-option-${id}` instead of `button-${id}`
   - Group related elements: `composition-btc`, `composition-eth`

4. **Dynamic Test IDs**
   - Use template literals for lists: `data-testid={wallet-option-${wallet.address}}`
   - Ensure uniqueness in repeated elements

## Example: Complete Component Update

```tsx
// Before
<button onClick={() => setShowWalletSwitcher(!showWalletSwitcher)}>
  <Wallet className="w-4 h-4" />
  {connectedWallets.length} Wallets
</button>

// After
<button
  data-testid="wallet-switcher-button"
  onClick={() => setShowWalletSwitcher(!showWalletSwitcher)}
  aria-expanded={showWalletSwitcher}
  aria-haspopup="menu"
  aria-label={`Wallet switcher, ${connectedWallets.length} wallets connected`}
>
  <Wallet className="w-4 h-4" aria-hidden="true" />
  {connectedWallets.length} Wallets
</button>
```

## Verification

After adding test IDs, verify with:

```bash
# Run E2E tests
npm run test:e2e

# Run specific test file
npx playwright test tests/e2e/v22-multi-wallet.spec.ts

# Run with UI mode for debugging
npm run test:e2e:ui
```

## Component Locations

- **V22 Layout**: `/src/components/wallet/variations/WalletPortfolioPresenterV22.tsx`
- **V22 Wallet Menu**: `/src/components/wallet/variations/v22/WalletMenu.tsx`
- **V22 Bundle Client**: `/src/app/bundle/BundlePageClientV22.tsx`
- **V1 Layout**: `/src/components/wallet/variations/WalletPortfolioPresenter.tsx`
- **V1 Bundle Client**: `/src/app/bundle/BundlePageClient.tsx`
- **Switch Banner**: `/src/components/bundle/SwitchPromptBanner.tsx`

## Notes

- Some tests use fallback methods (text content, CSS selectors) when test IDs are missing
- Adding test IDs will make tests more reliable and maintainable
- All test IDs should be added in a single PR to avoid breaking existing tests
- Consider adding test IDs to analytics and backtesting views as well
