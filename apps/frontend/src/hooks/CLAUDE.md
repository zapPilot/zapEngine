See @../../CLAUDE.md for app-level conventions.

# Hooks

Custom React hooks for the frontend. Each hook has a single concern and follows the app rule that **all chain/API access goes through `src/services/`** — hooks must not call `fetch()` or chain RPCs directly.

## Layout

```
hooks/
├── analytics/   # Hooks reading from analytics-engine (portfolio metrics, BTC price, regime, sentiment)
├── bundle/      # Multi-wallet bundle hooks (aggregated portfolio across wallets)
├── mutations/   # React Query useMutation hooks (deposits, rotations, admin actions)
├── queries/     # React Query useQuery hooks (general server data fetching)
├── ui/          # UI-only state hooks (modals, toasts, viewport, focus)
├── utils/       # Generic hook primitives (debounce, previous value, mounted-flag)
├── wallet/      # Wallet/chain state — only place that wraps wagmi / Thirdweb
└── (root .ts)   # Cross-cutting feature hooks: useDepositExecutionState, useGmxDeposit,
                #   useInvestStrategy, usePortfolioRules
```

`README-charts.md` documents the chart-data hook conventions specific to recharts integration.

## Where new hooks go

| Hook does…                                       | Put it in    |
| ------------------------------------------------ | ------------ |
| Fetches via a service (GET)                      | `queries/`   |
| Calls a service mutation (POST/PUT/DELETE)       | `mutations/` |
| Reads from `analyticsService.ts`                 | `analytics/` |
| Aggregates across the multi-wallet bundle        | `bundle/`    |
| Wraps wallet/chain reads or actions              | `wallet/`    |
| Manages UI-only state (modal open, viewport)     | `ui/`        |
| Reusable primitive (debounce, mounted, previous) | `utils/`     |
| Composes ≥3 of the above for one feature flow    | Root level   |

## Conventions

- All hooks named `useXxx` and exported as a single hook per file
- Wallet/chain access **only** through `useWalletProvider()` from `wallet/` — never import wagmi/Thirdweb elsewhere
- Use TanStack Query for server state; `useState`/`useReducer` for ephemeral UI state
- Query keys are stable arrays — don't allocate new objects in the key each render
- A hook that grows beyond ~80 lines should be split or moved to root-level

## Gotchas

- `useChain()` / `useWalletProvider()` can return null before wallet hydration — always guard
- React Query mutations don't auto-invalidate; call `queryClient.invalidateQueries` after `onSuccess`
- Importing wagmi hooks outside `wallet/` is enforced by ESLint and CI
