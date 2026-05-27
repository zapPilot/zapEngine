See @../../CLAUDE.md for app-level conventions.

# Services

All external API and chain access for the frontend lives here. **Services are plain functions** — no classes, no React, no singletons. Hooks (`src/hooks/`) and components consume services; services never import from hooks or components.

## Layout

Each service file matches an upstream domain:

| File                            | Talks to                               | Owns                                      |
| ------------------------------- | -------------------------------------- | ----------------------------------------- |
| `accountService.ts`             | account-engine                         | User profile, settings, bundle membership |
| `walletService.ts`              | account-engine                         | Wallet CRUD within a bundle               |
| `bundleService.ts`              | account-engine                         | Bundle aggregation requests               |
| `tokenBalanceService.ts`        | account-engine + chain RPCs            | Per-wallet token balances                 |
| `transactionService.mock.ts`    | (mock)                                 | Transaction history fixtures for dev      |
| `chainService.mock.ts`          | (mock)                                 | Chain metadata fixtures                   |
| `intentClient.ts`               | `@zapengine/intent-engine`             | Building intents client-side              |
| `planOrchestrationService.ts`   | account-engine `/plan-orchestration/*` | Deposit/rotate plan requests              |
| `analyticsService.ts`           | analytics-engine                       | Portfolio analytics (TVL, returns)        |
| `analyticsExportService.ts`     | analytics-engine                       | CSV / chart export endpoints              |
| `backtestingService.ts`         | analytics-engine                       | Backtest runs                             |
| `backtestingTimelineService.ts` | analytics-engine                       | Backtest timeline data                    |
| `btcPriceService.ts`            | analytics-engine                       | BTC price reference series                |
| `regimeHistoryService.ts`       | analytics-engine                       | Market regime history                     |
| `sentimentService.ts`           | analytics-engine                       | Sentiment indicators                      |
| `strategyService.ts`            | analytics-engine                       | Strategy suggestions (user-facing)        |
| `strategyAdminService.ts`       | analytics-engine                       | Strategy admin endpoints                  |
| `telegramService.ts`            | account-engine                         | Telegram link/unlink                      |
| `suggestion/`                   | analytics-engine                       | Per-flow suggestion composition           |

`index.ts` re-exports the public surface. Import via `@/services` — never deep paths.

## Conventions

- **Plain functions only**: `export async function fetchFoo(…)`, not classes
- One file = one upstream domain; helpers live alongside but stay unexported
- Validation at the boundary: every response goes through a Zod schema (Zod v4); don't trust the wire
- Errors: throw typed errors (`ApiError`, `ChainError` from `src/lib/errors/`), don't return error objects
- `.mock.ts` suffix marks dev-only mock services — never import from production code paths
- Use `viem` for chain RPC; never call `window.ethereum` directly
- All HTTP via the shared client from `src/lib/http/` (gives retry, auth, timeout, telemetry)

## Gotchas

- analytics-engine field is `daily_values` (not `daily_totals`) — easy to typo
- account-engine wallets are scoped to bundles — never query without a `bundleId`
- `intentClient.ts` uses `@zapengine/intent-engine` directly; bundles get tree-shaken — don't import from intent-engine elsewhere
- Plan-orchestration service is the **only** path to backend deposit plans; frontend never recomputes a plan locally
