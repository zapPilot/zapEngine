See @../../CLAUDE.md for app-level conventions.

# Lib

Shared infrastructure for the frontend — utilities, primitives, and integration helpers that don't fit `services/` (no I/O endpoint) or `components/` (no UI).

## Layout

```
lib/
├── analytics/      # Client-side analytics helpers (GA, Mixpanel wrappers, event names)
├── bundle/         # Bundle-aware utilities (selectors, aggregation pure functions)
├── domain/         # Domain models & branded types (Money, Percent, ChainId helpers)
├── env/            # VITE_* env access — typed, validated at boot
├── errors/         # Typed error classes thrown by services & caught by error boundaries
├── http/           # Shared fetch client (retry, auth headers, timeout, telemetry)
├── lazy/           # Lazy-loading helpers (dynamic import wrappers, suspense fallbacks)
├── portfolio/      # Portfolio math (allocations, returns, drawdown — pure functions)
├── routing/        # Router utilities (typed routes, redirects, deep links)
├── state/          # Global stores (zustand/context bootstrapping)
├── ui/             # Headless UI primitives (focus traps, scroll lock, animation easings)
├── validation/     # Reusable Zod schemas & validators
├── wallet/         # Chain & wallet pure helpers (address shorten, chainId → name)
└── csvGenerator.ts # Standalone CSV builder used by export flows
```

## lib vs services vs hooks vs utils

| Concern                                              | Put it in                               |
| ---------------------------------------------------- | --------------------------------------- |
| Calls an upstream API or chain RPC                   | `services/`                             |
| Returns React state / subscribes to a service        | `hooks/`                                |
| Pure helper that needs to run in services AND hooks  | `lib/<domain>/`                         |
| One-off util used by a single component              | Co-locate next to that component        |
| Cross-app reusable type or schema                    | `@zapengine/types` (not `lib/`)         |
| Cross-app reusable intent / routing logic            | `@zapengine/intent-engine` (not `lib/`) |

There is no `utils/` — pick the right `lib/` subdomain or extend an existing one.

## Conventions

- Functions over classes; immutable inputs; no side effects in domain/portfolio/wallet helpers
- All `lib/env/` access goes through the typed wrapper — never `import.meta.env.VITE_…` ad-hoc
- HTTP: always via `lib/http/` client — no raw `fetch()` outside this module
- Zod v4 only (the v3 API differs subtly — schemas won't compile)
- Error classes extend `BaseError` in `lib/errors/`; new error types add an entry to the discriminator union

## Gotchas

- `lib/state/` stores hydrate before wallet — guard reads on `isHydrated`
- `lib/domain/` branded types (e.g. `Money`) need their constructor, not raw numbers — TS will complain if mixed
- `lib/portfolio/` math assumes ISO-date keys; mixing epoch ms vs ISO causes silent NaN
