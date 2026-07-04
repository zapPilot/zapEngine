See @../../CLAUDE.md for monorepo development guidelines.

# Package-Specific Constraints

## Platform boundary: RN-safe vs web-only

app-core is consumed by desktop (Tauri) and React Native + web (app).
Every module is RN-safe unless listed below — RN-safe means no DOM
globals (`window`, `document`), no `import.meta`, and no web-only libraries
(`@privy-io/react-auth`, `framer-motion`, `lucide-react`,
`@tanstack/react-query-devtools`). ESLint enforces this
(`eslint.config.mjs`: `no-restricted-globals` / `no-restricted-imports` —
including patterns that ban importing web-only _internal_ modules from RN-safe
code — / `no-restricted-syntax`, with a `WEB_ONLY_FILES` exemption list that
also covers the barrels re-exporting web-only modules: `hooks`,
`hooks/bundle` — the `services`, `utils`, and `hooks/wallet` barrels are
RN-safe).

| Subpath                                                                                                                                                                                                                                                                                                                                     | Status   | RN-safe alternative                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `hooks/bundle/*` (`useBundlePage`)                                                                                                                                                                                                                                                                                                          | web-only | `lib/bundle/*` is RN-safe                                                                         |
| `hooks/wallet/usePrivyWalletBackend` (Privy web SDK, DOM)                                                                                                                                                                                                                                                                                   | web-only | `providers/walletContext` + a native `WalletProviderInterface`                                    |
| `providers/PrivyAuthProvider`, `providers/WalletProvider`, `providers/QueryProvider`                                                                                                                                                                                                                                                        | web-only | `providers/walletContext` (`WalletProviderBase`), `QueryClientProvider` + `lib/state/queryClient` |
| `hooks/queries/*`, `hooks/mutations/*`, `hooks/analytics/*`, `hooks/wallet/*` (except usePrivyWalletBackend)                                                                                                                                                                                                                                | RN-safe  | use directly                                                                                      |
| `services/*`, `adapters/*`, `lib/http/*`, `lib/state/*`, `lib/env/*`, `lib/domain/*`, `lib/errors/*`, `lib/validation/*`, `lib/portfolio/*`, `lib/analytics/*`, `lib/bundle/*`, `lib/ui/*` (framer types only), `regime/*`, `types/*`, `utils/*`, `constants/*`, `config/*`, `schemas/*`                                                   | RN-safe  | use directly                                                                                      |

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

## Adding a web-only module

If a new module genuinely needs the DOM or a web-only library, add it to
`WEB_ONLY_FILES` in `eslint.config.mjs` and to the table above — do not widen
the default rules.
