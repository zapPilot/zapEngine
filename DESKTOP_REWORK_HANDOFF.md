# Desktop rework — handoff

Branch: `claude/jovial-kilby-33bd96` (worktree). This commit reskins `apps/desktop`
with the "Zap Pilot POC" design and extracts a shared `@zapengine/app-core`
package. **Resume from here in a fresh session.**

## TL;DR status

| Area | State |
| --- | --- |
| New desktop app + 8 screens (mock data) | ✅ done, verified (preview screenshots match design; type-check/lint/format/test green) |
| `@zapengine/app-core` extraction (structure) | ✅ frontend + app-core + desktop **type-check, build, lint all green** |
| frontend unit tests after extraction | ✅ **fixed — full `test:unit` 4227 pass / 0 fail** (commit `f945f997`) |
| deadcode / dup / coverage reconciliation | ✅ **green** for app-core/frontend/desktop; coverage no-regression clean (commit `47f4fa18`) |
| Task 4 — wire desktop to real data | ✅ **code-complete** — all 8 screens wired to `@zapengine/app-core` (connect gate + Home/Portfolio/Strategy/Activity/Account + Invest 3-step→sign); desktop type-check/lint/deadcode/dup/test + `build:web` all green; dev server boots and screens render with graceful degradation |
| Task 5 — end-to-end verification | 🟡 **non-interactive parts done** (boot/render/build/gates verified; data hooks hit the live backends) — **remaining is user-driven**: restart analytics-engine for CORS, Privy login, testnet sign |

Everything is in an **isolated worktree** on a feature branch; the main checkout
is untouched. The desktop skin does **not** depend on the extraction (it uses
mock data), so the extraction can be finished or reverted independently.

### What the original handoff got wrong (corrected here)

The "71 failing tests" were **not** a vitest-mock-across-`dist`-boundary problem,
and the claimed "type-check/lint all green" was **stale** — `tsc` actually failed.
Two real root causes (both now fixed, see commit `f945f997`):

1. **Two physical Privy instances.** app-core listed `@privy-io/react-auth` (and
   `@tanstack/react-query[-devtools]`) under `dependencies`, so pnpm resolved a
   second copy under a different peer-closure hash. PrivyProvider context never
   reached app-core's hooks and `vi.mock` couldn't intercept. Fix: those three
   libs are now `peerDependencies`, and frontend's `resolve.dedupe` pins a single
   instance (test + build + runtime). _Note: this was also a latent **runtime**
   bug for the real frontend/desktop, not just tests._
2. **Runtime values stranded in `import type`.** The extraction's import rewrite
   swept `regimes` / `getStrategyTabLabel` (and left nested `type` residue) into
   `import type {}` blocks in `StrategyCardExpandedContent.tsx` /
   `StrategyDirectionTabs.tsx` → `ReferenceError` at render (tsc TS1361/TS2206).
   Fixed by restoring value imports.

The rest were test-only mock-target fixes (partial barrel mocks that keep real
co-exports; a missing lucide icon stub) — see commit `f945f997`.

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

## ✅ RESOLVED: the 71 failing frontend unit tests

Fixed in commit `f945f997`. The actual root causes are summarised in
"What the original handoff got wrong" above (two physical Privy instances +
runtime values stranded in `import type`, plus a few test-only mock-target
fixes). Full suite now **4227 pass / 0 fail**; app-core + frontend + desktop
type-check/lint/build green; deadcode/dup/coverage reconciled (commit
`47f4fa18`). The stale analysis below is kept only for historical context.

<details>
<summary>Original (incorrect) blocker analysis — historical</summary>

**Root cause (as originally believed — superseded).** The failing tests
`vi.mock(...)` app-core-internal modules to control
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

</details>

## Remaining tasks

1. ✅ **Fix the frontend unit tests** — done (commit `f945f997`), full `test:unit`
   4227 pass / 0 fail.
2. ✅ **Task 4 — wire desktop to real data** — done (commits `3128f9be`,
   `0c489186`, `58b2ec22`, `ffa0e588`). `src/integration/` holds the seam:
   `DesktopProviders` (QueryProvider→PrivyAuthProvider→WalletProvider +
   `isPrivyEnabled` guard, mounted in `main.tsx`); desktop `vite.config` adds the
   same `resolve.dedupe` as frontend (single Privy/Query instance). `useAccount`
   (useWalletProvider+useUser) drives a `ConnectGate` (Privy login) that AppShell
   shows until connected. Per-screen container hooks map live data into each
   screen's shape with defensive states + MOCK fallback (commented
   `NOTE(real-data)`, never `TODO`) for fields with no clean source:
   Home=`usePortfolioDataProgressive`+`usePortfolioDashboard`;
   Portfolio=`usePortfolioDashboard`; Strategy=`useSentimentData`+`useRegimeHistory`
   (backtest stays mock); Activity=`getDailyYieldReturns`+`useBorrowingPositions`
   merged with mock tx rows; Account=`useWalletProvider`/`useUser`. Invest:
   `InvestProvider` carries the amount; step2 previews `getDepositPlan`, step3
   runs `useInvestStrategy().run()` with a minimal `SimulationPreviewModal` wired
   into WalletProvider's `renderSimulationPreview`. (recharts NOT re-added — the
   hand-rolled SVG charts render real data fine; defer recharts as polish.)
   Added `.env` `CORS_ALLOWED_ORIGINS += http://127.0.0.1:3005,http://localhost:3005`
   (analytics-engine needs a restart to apply; account-engine uses `cors()` =
   allow-all, unaffected).
3. ✅ **Reconcile deadcode/dup/coverage** — done (commit `47f4fa18`). knip:
   app-core treats all src as entry (wholly public via `./*`), removed 4 phantom
   barrel exports, frontend/desktop ignore lists updated. jscpd: app-core/desktop
   `.jscpd.json` carry the import ignorePattern + the moved-file ignores; a shared
   `ArrowGlyph` was extracted to clear the desktop clone. coverage no-regression
   gate clean (frontend −0.04pp, within tolerance). _Note: `dayjs` is still used
   in frontend (tests); `@zapengine/intent-engine`/`@zapengine/types` are still
   used — the original handoff's removal hint was wrong._
4. 🟡 **Task 5 — end-to-end verify** — non-interactive parts done (desktop boots
   on :3005, all screens render, gates + `build:web` green, data hooks confirmed
   hitting the live backends). Remaining is **user-driven** (interactive Privy
   login + a funded wallet can't be automated):
   1. `pnpm --filter @zapengine/analytics-engine dev` **restart** so it picks up
      the new desktop CORS origins (else its calls 500/CORS-fail and screens fall
      back to placeholders — by design, no crash).
   2. `pnpm --filter @zapengine/desktop dev:web` (browser :3005) or `… dev`
      (native window) → click **Connect wallet** → Privy login → your `userId`
      resolves via account-engine → Home/Portfolio/Activity show your real data.
   3. Invest 3-step → **Confirm & Start** → sign in the `SimulationPreviewModal`
      (testnet / small amount).

## Verification commands (run directly — `pnpm verify *` breaks in worktrees)

```bash
# package + frontend gates (turbo builds deps first)
pnpm turbo run type-check --filter=@zapengine/app-core --filter=@zapengine/frontend
pnpm --filter @zapengine/app-core build      # tsc && tsc-alias → dist
pnpm --filter @zapengine/frontend test:unit  # 4227 pass / 0 fail
pnpm --filter @zapengine/frontend build
pnpm --filter @zapengine/frontend lint        # green (1 pre-existing warning)
pnpm --filter @zapengine/app-core lint        # green
# deadcode + dup (all green) + coverage no-regression (DB-free 3-step):
pnpm turbo run deadcode dup:check --filter=@zapengine/app-core --filter=@zapengine/frontend --filter=@zapengine/desktop
pnpm turbo run test:coverage --filter=@zapengine/frontend --filter=@zapengine/intent-engine --filter=@zapengine/types \
  && pnpm exec tsx scripts/coverage-summary.ts && pnpm exec tsx scripts/coverage-regression.ts
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
