See @../../../AGENTS.md and [Architecture planes](../../../../../docs/architecture/planes.md).

# Plan orchestration module

This is a bounded composition layer between analytics-engine strategy output and `@zapengine/intent-engine` routing. It owns analytics-to-intent normalization and the `/plan-orchestration/*` HTTP contract; it is not a second strategy or routing engine.

## Boundaries

- Allowed domain dependencies: `@zapengine/intent-engine`, `@zapengine/types`, and the analytics-engine HTTP client.
- Keep identity/session/user-persistence concerns outside this module.
- Deposit/rotate planning has one authoritative backend path here; clients confirm and execute the returned plan and must not independently recompute it.
- Keep service errors framework-free; map them to HTTP responses in `route.ts`.
- Validate route payloads with the shared Zod wire schemas from `@zapengine/types`.
- Create chain clients only through `publicClients.ts`; never hardcode RPC URLs or instantiate ad-hoc clients in service logic.

## Change checks

- Wire-contract changes require `pnpm contracts check` so TypeScript and Pydantic stay aligned.
- `DEPOSIT_DEFAULT_SPLIT` is parsed at startup by `parseDepositDefaultSplit`; malformed rollout config must fail fast rather than silently default.
- Before enabling a Hyperliquid/HLP split, run `packages/intent-engine/examples/hyperliquid-hlp-verify.ts`.
- Do not rename this module to `intent-service`; that name collides conceptually with `@zapengine/intent-engine`.
