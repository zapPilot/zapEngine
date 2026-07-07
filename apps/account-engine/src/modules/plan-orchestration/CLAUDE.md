See @../../../CLAUDE.md and the repo root [Architecture planes](../../../../../CLAUDE.md#architecture-planes).

# plan-orchestration (module)

Bounded composition module — **not** an engine — sitting between analytics-engine (strategy) and `@zapengine/intent-engine` (routing). Owns the analytics→intent normalisation (allocation % → chain/token intents) and the `POST /plan-orchestration/{deposit,rebalance}` HTTP contract.

> **Eventual home**: this module is the proxy for the future `apps/plan-orchestration` app. See [docs/plan-orchestration-evolution.md](../../../docs/plan-orchestration-evolution.md) for the extraction roadmap.

## Files

| File               | Role                                                                    |
| ------------------ | ----------------------------------------------------------------------- |
| `index.ts`         | Module barrel — exports the route registrar and service factory         |
| `route.ts`         | Hono route handlers for `POST /plan-orchestration/{deposit,rebalance}`  |
| `service.ts`       | Composition logic — strategy allocation → normalised intent → exec plan |
| `publicClients.ts` | Viem `PublicClient` factories per chain (lazy, memoised)                |

## Dependency rules

- **Allowed deps**: `@zapengine/intent-engine`, `@zapengine/types`, analytics-engine HTTP client (in `services/analytics-client.service.ts`)
- **Forbidden**: identity/persistence concerns (auth, sessions, user DB) — those live elsewhere in account-engine. plan-orchestration is the composition layer, not the identity layer.
- **One authoritative path**: the deposit/rotate plan is computed **only** here. Frontend calls this endpoint; it never recomputes the plan locally against a shared contract.

## Conventions

- Service functions only — no classes
- Validation at the route boundary via Zod schemas from `@zapengine/types` (`/api/plan-orchestration/*`)
- Errors thrown by `service.ts` are mapped to HTTP 4xx/5xx in `route.ts` — keep service errors framework-free
- `publicClients.ts` reads RPC URLs from env (`RPC_URL_BASE`, `RPC_URL_ETHEREUM`, `RPC_URL_ARBITRUM`) — never hardcode URLs in service.ts

## Gotchas

- The `POST` request body shape lives in `@zapengine/types` (`PlanOrchestrationDepositRequest`, etc.). If you change the wire shape, run `pnpm contracts check` so Pydantic side stays in sync.
- `DEPOSIT_DEFAULT_SPLIT` (JSON, e.g. `{"8453":0.7,"1337":0.3}`) is the no-deploy rollout/rollback lever for cross-chain invest plans; malformed values fail container startup via `parseDepositDefaultSplit`. `HYPERLIQUID_NETWORK` (mainnet|testnet) picks the HLP vault + exchange API in emitted follow-ups. Before opening the split toward 1337, run `packages/intent-engine/examples/hyperliquid-hlp-verify.ts`.
- Renaming this module to `intent-service` collides with `@zapengine/intent-engine` — don't.
- Adding a new RPC: only update `publicClients.ts`; never instantiate a client in `service.ts` directly.
