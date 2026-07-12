# Podcast-first authentication and approved wallets implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Podcast the default public catalog, resume gated actions after login, and expose only Privy plus approved EIP-7702 wallet brands.

**Architecture:** An app-local authenticated-action provider sits above the podcast player and stores a single continuation until the shared wallet backend becomes connected. Route shells and the tab bar consume the same account state. Wallet discovery stays in app-core, while a pure app integration function applies the product allowlist; on-chain delegation inspection remains the execution security boundary.

**Tech Stack:** Expo Router 57, React 19, React Native, Privy, wagmi, viem, Vitest, Playwright, Turbo.

## Global Constraints

- Use the existing wallet/login abstractions; no podcast-specific account system.
- Podcast remains the default route before and after login.
- Guests may browse Podcast and Strategy but may not play audio or enter personal/money-moving screens.
- Visible external wallets are Rabby, Ambire, and OKX only; generic WalletConnect is hidden.
- Unknown or unsupported existing EIP-7702 delegates fail closed.
- Web, desktop, and native share behavior; native retains Privy Email as its currently available connector.

---

### Task 1: Approved wallet filtering and delegation safety

**Files:**

- Modify: `apps/app/src/integration/connectOptions.ts`
- Modify: `apps/app/tests/connectOptions.test.ts`
- Modify: `packages/app-core/src/lib/wallet/executeDepositPlan.ts`
- Modify: `packages/app-core/tests/lib/wallet/executeDepositPlanWithWallet.test.ts`

**Interfaces:**

- Produces: `partitionWalletOptions(connectors)` returning only approved injected connectors and no generic WalletConnect option.
- Consumes: `inspectDelegation()` compatibility values; execution accepts only `none` and `supported`.

- [ ] Add failing tests proving OKX is recommended, MetaMask and generic WalletConnect are hidden, and unknown delegation is rejected before `wallet_sendCalls`.
- [ ] Run the two focused Vitest files and confirm the new assertions fail for the current permissive behavior.
- [ ] Extend approved-name/RDNS matching for OKX, filter the picker input to approved injected connectors, and reject `unknown` alongside `unsupported` delegation compatibility.
- [ ] Re-run the focused tests and confirm they pass.

### Task 2: Authenticated action coordinator and playback gate

**Files:**

- Create: `apps/app/src/providers/AuthenticatedActionProvider.tsx`
- Create: `apps/app/tests/AuthenticatedActionProvider.test.tsx`
- Modify: `apps/app/src/providers/AppProviderShell.tsx`
- Modify: `apps/app/src/providers/PodcastPlayerProvider.tsx`
- Modify: `apps/app/src/components/connect/ConnectSheetHost.web.tsx`

**Interfaces:**

- Produces: `useAuthenticatedAction()` with `run(action: () => void): void` and `cancel(): void`.
- Consumes: `useAccount().isConnected/connect`; Podcast provider wraps `toggle` and `playFromQueue` through `run`.

- [ ] Add failing provider tests for immediate execution while connected, deferred one-shot execution after connection, clearing on failed connect, and clearing when the picker closes.
- [ ] Run the focused test and confirm failure because the provider does not exist.
- [ ] Implement the minimal provider, mount it above `PodcastPlayerProvider`, wrap playback entry points, and cancel pending work from the web sheet close handler.
- [ ] Re-run provider and podcast tests and confirm they pass.

### Task 3: Podcast-first routing, guest navigation, and route gates

**Files:**

- Create: `apps/app/src/components/auth/AuthenticatedRoute.tsx`
- Create: `apps/app/src/integration/navigationModel.ts`
- Create: `apps/app/tests/navigationModel.test.ts`
- Modify: `apps/app/src/app/index.tsx`
- Modify: `apps/app/src/app/(tabs)/_layout.tsx`
- Modify: `apps/app/src/components/BottomTabBar.tsx`
- Modify: personal and money-moving thin route/layout shells under `apps/app/src/app/`

**Interfaces:**

- Produces: `visibleTabNames(isConnected)` with guest order `['podcast', 'strategy']` and authenticated order `['podcast', 'home', 'strategy', 'activity', 'account']`.
- Produces: `AuthenticatedRoute` that renders its children when connected and otherwise renders a shared login CTA in place without changing the URL.

- [ ] Add failing navigation tests for root Podcast, guest tabs, and authenticated tab order.
- [ ] Run the focused tests and confirm the expected failures.
- [ ] Redirect `/` to `/podcast`, reorder tab registration, hide disallowed guest tab buttons, and wrap Home, Activity, Account, Portfolio, Send, and Invest.
- [ ] Re-run navigation and route smoke tests and confirm the new behavior passes.

### Task 4: Strategy continuation

**Files:**

- Modify: `apps/app/src/screens/StrategyScreen.tsx`
- Modify: `apps/app/src/screens/HomeScreen.tsx`
- Create or modify: focused screen/integration tests under `apps/app/tests/`

**Interfaces:**

- Consumes: `useAuthenticatedAction().run`.
- Behavior: both Zap Strategy CTAs call `run(() => router.push('/invest/amount'))`.

- [ ] Add a failing test showing a guest Start action opens login and navigates exactly once after connection.
- [ ] Run it and confirm failure under the current direct navigation behavior.
- [ ] Route both CTAs through the coordinator.
- [ ] Re-run the focused test and confirm it passes.

### Task 5: Verification

**Files:**

- Modify only files required by failures attributable to this change.

- [ ] Run formatting checks for the touched workspaces without rewriting unrelated user changes.
- [ ] Run `pnpm turbo run type-check lint test build deadcode dup:check --filter=@zapengine/app --filter=@zapengine/app-core`.
- [ ] Run `pnpm verify changed`, inspect `.ai-verify/result.json` on failure, and fix only failures caused by this work.
- [ ] Review the final diff against the design requirements and confirm no generic WalletConnect or unsupported-wallet path remains visible.
