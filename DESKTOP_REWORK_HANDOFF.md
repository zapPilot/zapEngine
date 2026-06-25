# Desktop rework — handoff

Branch: `claude/jovial-kilby-33bd96` (worktree). This commit reskins `apps/desktop`
with the "Zap Pilot POC" design and extracts a shared `@zapengine/app-core`
package. **Resume from here in a fresh session.**

## TL;DR status

| Area | State |
| --- | --- |
| New desktop app + 8 screens (mock data) | ✅ done, verified (preview screenshots match design; type-check/lint/format/test green) |
| `@zapengine/app-core` extraction (structure) | ✅ frontend + app-core **type-check, build, lint all green** |
| frontend unit tests after extraction | ❌ **71 / 4154 fail** (14 files) — vitest mocks of app-core internals don't intercept across the built `dist` boundary |
| Task 4 — wire desktop to real data | ⛔ not started |
| Task 5 — end-to-end verification | ⛔ not started |

Everything is in an **isolated worktree** on a feature branch; the main checkout
is untouched. The desktop skin does **not** depend on the extraction (it uses
mock data), so the extraction can be finished or reverted independently.

## Decisions already made (do not relitigate)

- Layout: **faithful mobile**, centered phone frame in the 1280×840 window, bottom 5-tab nav; fake iOS status bar dropped (a `PhoneFrame` prop, off by default).
- Reuse: **extract a shared package**; frontend imports from it (clean break, no compat shims). Gate = frontend type-check/test/build stay green.
- Scope: all 8 screens built at once.
- Activity: real data where available (yield/borrowing) + mocked rows flagged.
- Package named **`@zapengine/app-core`** (broad "non-component app core"), internal alias **`@core/*`** (renamed from `@/*` to avoid clashing with frontend's `@/`). Built with `tsc && tsc-alias` (rewrites `@core/*` → relative in `dist`).

## What was built

### `apps/desktop` — standalone Vite + React 19 app (was a Tauri shell over frontend)
- New: `index.html`, `vite.config.ts` (port **3005**, `envDir` repo root, `@`→src, no PWA), `postcss.config.mjs`, `vite-env.d.ts`, `src/main.tsx`, `src/app/{App,AppShell,globals.css}`, `src/components/*` (PhoneFrame, BottomTabBar, ui/*, token/*, charts/*, metrics/*, invest/*), `src/routes/*` (8 screens), `src/data/mock.ts`, `src/lib/{cn,format}.ts`.
- `src-tauri/tauri.conf.json` repointed to desktop's own `dev:web`/`build:web` (port 3005, `frontendDist: ../dist`); `tests/tauriConfig.test.ts` updated in lockstep.
- Charts are hand-rolled SVG (faithful to design); recharts deferred to the wiring phase.
- Run it: `pnpm --filter @zapengine/desktop dev:web` (browser on :3005) or `pnpm --filter @zapengine/desktop dev` (Tauri window). `.claude/launch.json` has a `desktop` preview config.

### `packages/app-core` — shared non-component layer (frontend + desktop)
- Moved out of `apps/frontend/src`: `services, adapters, providers, utils, config, constants, schemas, types, lib/* (except routing, lazy), hooks/* (except bundle, usePortfolioRules)`, plus the regime data files (`regime/{regimeData,investAllocation,strategyLabels}.ts`, moved from `components/wallet/regime/`).
- Stayed in frontend: `components`, `app`, `main.tsx`, `lib/routing`, `lib/lazy`, `hooks/usePortfolioRules.ts`, `hooks/bundle/`, and **moved back** `providers/ToastProvider.tsx` + `components/.../sections/marketDashboardRouteState.ts` (UI/component-coupled).
- Coupling edges resolved: DCA const inlined in `backtestingService`; `Toast` type in `providers/toastTypes.ts`; `WalletProvider` Tenderly modal **inverted to a `renderSimulationPreview` render-prop** (frontend injects `TenderlyPreviewModal` in `BundleProviders`); `useEtlJobSync` uses a local `AppRouterLike`; regime imports repointed to `@core/regime/*`.
- `package.json` exports: explicit barrels for dirs imported bare + a `./*` wildcard for deep files. Internal `@core/*` → `dist` relative via tsc-alias.
- frontend: added `@zapengine/app-core` dep; `knip.ts` stale `ServiceError` ignore removed; ~396 src files + ~8 test files had imports rewritten (`@/<moved>` and `(../)+src/<moved>` → `@zapengine/app-core/<moved>`).

## THE BLOCKER: 71 failing frontend unit tests

**Root cause.** The failing tests `vi.mock(...)` app-core-internal modules to control
behavior. After extraction, app-core ships as built `dist` with **relative** internal
imports, and app-core has its **own copies** of `@privy-io/react-auth` / `viem` /
`@tanstack/react-query`. So:
1. A test mocking `@zapengine/app-core/X` does not intercept a sibling module that
   `dist` imports via a relative path (different resolved file than the barrel), and
2. mocks of external deps (e.g. `@privy-io/react-auth`) don't apply to app-core's
   own instance → e.g. "No Privy wallet connected" / "You need to wrap … PrivyProvider".

**What was tried (did not fix it):** added a vitest `test.alias` in
`apps/frontend/vite.config.ts` mapping `@zapengine/app-core` + `@core/*` → app-core
`src`. Failure counts were unchanged, so the alias is likely **not being applied**
by Vitest (it may need to live in `resolve.alias`, or app-core must be added to
`test.server.deps.inline` so Vitest transforms it from source).

**Recommended fix (next session), in order of robustness:**
1. **Move the affected unit-test files into `packages/app-core/tests/`** and give
   app-core a real vitest config (jsdom + a test setup + `@core` alias → `src`).
   Tests then mock `@core/...` — the *same* specifier the package imports internally
   — so mocks intercept. This is the cleanest and matches "tests live with code".
2. OR make the frontend source-alias actually take effect (confirm Vitest honors it;
   add `test.server.deps.inline: [/@zapengine\/app-core/]`), AND make app-core's
   `@privy-io/react-auth`, `viem`, `@tanstack/react-query` **peerDependencies** (not
   deps) so there is a single instance shared with the consumer.
3. Fix `regimeAdapter.test.ts` specifically: it `vi.mock('@zapengine/app-core/regime')`
   (the barrel) but the adapter imports `@core/regime/regimeData` — the mock must
   target `…/regime/regimeData` (and `…/regime/investAllocation`).

**Exact failing files (14):**
```
tests/unit/hooks/wallet/usePrivyWalletBackend.test.tsx        (17)
tests/unit/components/wallet/portfolio/PortfolioComposition.test.tsx   (23)
tests/unit/components/wallet/portfolio/WalletPortfolioPresenter.test.tsx (13)
tests/unit/components/wallet/portfolio/components/strategy/StrategyCard.test.tsx
tests/unit/components/wallet/portfolio/components/strategy/StrategyDirectionTabs.test.tsx
tests/unit/components/wallet/portfolio/components/StrategyCard.test.tsx
tests/unit/components/wallet/portfolio/views/invest/trading/components/ReviewModalTabs.test.tsx
tests/unit/components/wallet/portfolio/views/BacktestingView.test.tsx
tests/unit/components/wallet/portfolio/modals/{WithdrawModal,DepositModal}.test.tsx
tests/unit/components/wallet/portfolio/modals/hooks/useTransactionSubmission.test.ts
tests/unit/adapters/portfolio/regimeAdapter.test.ts          (3)
tests/unit/providers/PrivyAuthProvider.test.tsx              (2)
tests/unit/components/WalletManager.ownerView.test.tsx
```
All share the mock-across-package-boundary cause above. The earlier relative-import
(`(../)+src/<moved>`) and `ToastProvider` path issues are already fixed.

## Remaining tasks

1. **Fix the 71 frontend unit tests** (see above) → frontend test:unit green.
2. **Task 4 — wire desktop to real data**: add a `src/integration/*` seam in desktop re-exporting from `@zapengine/app-core`; mount `QueryProvider→PrivyAuthProvider→WalletProvider` (+ `isPrivyEnabled` guard, no white-screen); replicate connect→resolve `userId`→fetch (see `apps/frontend/src/app/bundle/BundlePageEntry/Client`); bind each screen to its hook (Home `usePortfolioDataProgressive`; Invest `useInvestStrategy`/`getDepositPlan`/`useDepositExecutionState`, source defaults to **Base** per `useInvestStrategy` v1; Strategy `runBacktest`/sentiment/regime; Portfolio `usePortfolioDashboard`; Activity `getDailyYieldReturns`+`getBorrowingPositions`+mock; Account `useWalletProvider`/`useUser`). Re-add `recharts` to desktop for live charts. Desktop needs `@zapengine/app-core` as a dep + Privy/viem/etc.
3. **Reconcile deadcode/dup/coverage**: run `knip` on app-core + frontend (frontend may now have unused deps, e.g. `dayjs`, `@zapengine/intent-engine`, `@zapengine/types` — remove if unused); jscpd may flag clones from co-located services (budget a dedup pass); regenerate coverage baseline.
4. **Task 5 — end-to-end verify** (see commands below); confirm `pnpm --filter @zapengine/frontend dev` still serves; preview desktop screens; connect wallet → real Home; invest 3-step → sign (testnet/small).

## Verification commands (run directly — `pnpm verify *` breaks in worktrees)

```bash
# package + frontend gates (turbo builds deps first)
pnpm turbo run type-check --filter=@zapengine/app-core --filter=@zapengine/frontend
pnpm --filter @zapengine/app-core build      # tsc && tsc-alias → dist
pnpm --filter @zapengine/frontend test:unit  # <-- currently 71 failing
pnpm --filter @zapengine/frontend build
pnpm --filter @zapengine/frontend lint        # green (1 pre-existing warning)
pnpm --filter @zapengine/app-core lint        # green
# desktop
pnpm --filter @zapengine/desktop type-check && pnpm --filter @zapengine/desktop lint && pnpm --filter @zapengine/desktop test
pnpm --filter @zapengine/desktop dev:web      # preview on :3005
```

## Key files
- Plan: `~/.claude/plans/zap-pilot-poc-dc-html-bubbly-salamander.md`
- Design: `<repo-root>/Zap Pilot POC.dc.html` (main repo root; read-only reference)
- Extraction build mechanism: `packages/app-core/{package.json,tsconfig.json}` (tsc-alias keeps source `@core/*`, emits relative dist)
- Tenderly inversion: `packages/app-core/src/providers/WalletProvider.tsx` + `apps/frontend/src/app/bundle/BundleProviders.tsx`
- Vitest alias attempt: `apps/frontend/vite.config.ts` (`test.alias` — verify it applies)
