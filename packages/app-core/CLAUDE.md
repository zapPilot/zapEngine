See @../AGENTS.md for shared package guidelines.

# Package-Specific Constraints

## Platform boundary: RN-safe vs web-only

app-core is consumed by desktop (Tauri) and React Native + web (app).
Every module is RN-safe unless listed below — RN-safe means no DOM
globals (`window`, `document`), no `import.meta`, and no web-only libraries
(`@privy-io/react-auth`, `wagmi`, `framer-motion`, `lucide-react`,
`@tanstack/react-query-devtools`). ESLint enforces this
(`eslint.config.mjs`: `no-restricted-globals` / `no-restricted-imports` —
including patterns that ban importing web-only _internal_ modules from RN-safe
code — / `no-restricted-syntax`, with a `WEB_ONLY_FILES` exemption list that
also covers the barrels re-exporting web-only modules: `hooks`,
`hooks/bundle` — the `services`, `utils`, and `hooks/wallet` barrels are
RN-safe).

| Subpath                                                                                                                                                                                                                                                                                                          | Status   | RN-safe alternative                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `hooks/bundle/*` (`useBundlePage`)                                                                                                                                                                                                                                                                               | web-only | `lib/bundle/*` is RN-safe                                                                         |
| `hooks/wallet/usePrivyWalletBackend` (Privy web SDK, DOM)                                                                                                                                                                                                                                                        | web-only | `providers/walletContext` + a native `WalletProviderInterface`                                    |
| `hooks/wallet/useWagmiWalletBackend` (wagmi — external wallets have no reach on native)                                                                                                                                                                                                                          | web-only | `providers/walletContext` + a native `WalletProviderInterface`                                    |
| `hooks/wallet/useAtomicBatchExecution` (platform primitives injected by each host)                                                                                                                                                                                                                               | RN-safe  | use directly                                                                                      |
| `providers/PrivyAuthProvider`, `providers/WalletProvider`, `providers/QueryProvider`, `providers/Web3Provider`, `providers/walletLoginContext`                                                                                                                                                                   | web-only | `providers/walletContext` (`WalletProviderBase`), `QueryClientProvider` + `lib/state/queryClient` |
| `config/wagmi` (wagmi `createConfig`)                                                                                                                                                                                                                                                                            | web-only | n/a — native has no external-wallet config                                                        |
| `lib/env/walletConnect` (`getWalletConnectProjectId`, `isWalletConnectEnabled`)                                                                                                                                                                                                                                  | RN-safe  | use directly (mirrors `lib/env/privy`)                                                            |
| `hooks/queries/*`, `hooks/mutations/*`, `hooks/analytics/*`, `hooks/wallet/*` (except usePrivyWalletBackend, useWagmiWalletBackend)                                                                                                                                                                              | RN-safe  | use directly                                                                                      |
| `services/*`, `adapters/*`, `lib/http/*`, `lib/state/*`, `lib/env/*`, `lib/domain/*`, `lib/errors/*`, `lib/validation/*`, `lib/portfolio/*`, `lib/analytics/*`, `lib/bundle/*`, `lib/ui/*` (framer types only), `regime/*`, `types/*`, `utils/*`, `constants/*`, `config/*` (except `config/wagmi`), `schemas/*` | RN-safe  | use directly                                                                                      |

**Type-only imports are always allowed** (`import type` is erased at compile
time and never reaches the Metro bundle) — the lint uses
`@typescript-eslint/no-restricted-imports` with `allowTypeImports`.

Consumers mirror the guard: `apps/app/eslint.config.mjs` blocks the
web-only subpaths via `no-restricted-imports`.

## Env access

- Env reads go through `getRuntimeEnv` and must be **lazy** (no module-scope
  reads — use `get` accessors or memoized helpers, see `lib/http/config.ts` and
  `config/cacheWindow.ts`). `import.meta` is banned; apps inject their env via
  `configureAppCoreEnv` as the **first import** at bootstrap
  (`apps/desktop/src/bootstrap/appCoreEnv.ts`,
  `apps/app/src/config/appCoreEnv.ts`).
- New env keys keep the `VITE_` prefix — native hosts map their
  `EXPO_PUBLIC_*` values onto the `VITE_` keys in their bootstrap file.

## Execution hook concurrency

Latest-run/reset authority applies across app-core execution hooks, not only the
bridge flow. After **every awaited external boundary** in `useBridgeTest`,
`useGmxDeposit`, `useInvestStrategy`, or similar hooks, re-check the current
abort/run token before any downstream call or state publish. Stale work must not
restore status, hashes, plans, quotes, tiers, or errors. Regression tests should
pause the awaited boundary, supersede/reset the run, then resolve and reject it;
assert no downstream work and that only the newest run's state survives.

## Reviewed batch execution

Treat the reviewed batch as an immutable execution snapshot. After the user has
reviewed it, callers must submit that exact plan/transactions; do not refresh or
replan inside the submit handler. Expiry, wallet, batch, simulation, and risk
fingerprints are the freshness guard — stale review means block and require a new
review. Before resolving a wallet client or sending calls, switch to the reviewed
batch `chainId`; the wallet's currently selected chain is not authoritative.

## Adding a web-only module

If a new module genuinely needs the DOM or a web-only library, add it to
`WEB_ONLY_FILES` in `eslint.config.mjs` and to the table above — do not widen
the default rules.
