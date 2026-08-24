# Application workspaces

Read this file for shared app rules, then the nearest scoped instruction file for app-specific invariants and gotchas.

## Commands

Run workspace tasks through Turbo so internal package dependencies build first:

```bash
pnpm turbo run <task> --filter=<workspace>
```

Do not use a direct `pnpm --filter <workspace> type-check`, `lint`, or `test` when the workspace consumes internal packages; it can bypass Turbo's `^build` dependency chain and fail against stale or missing `dist` output.

All apps expose the common root script surface where applicable: `dev`, `build`, `test`, `test:ci`, `lint`, `type-check`, `format`, and `format:check`.

## Shared implementation rules

- Follow the existing service style in each app; do not introduce a new service paradigm in unrelated work. New TypeScript server apps should prefer plain functions under `src/services/` unless a scoped `AGENTS.md` documents a different architecture.
- Use ES modules.
- Use Zod v4 APIs and imports.
- Keep app-specific architecture and operational traps in the nearest scoped instruction file rather than duplicating them here.
- Follow [docs/app-layout.md](../docs/app-layout.md) for new TypeScript server app layout.

## Architecture boundaries

- `analytics-engine` decides allocation strategy and does not build transactions.
- `account-engine` owns identity, persistence, and plan orchestration, but identity code does not plan money movement.
- App clients confirm, sign, and broadcast prepared transactions; they do not independently rebuild authoritative plans.
- A money-moving flow must have one authoritative planning path.

The durable plane definitions live in [docs/architecture/planes.md](../docs/architecture/planes.md).

## Verification

During the edit loop, run only the narrowest relevant workspace test or check. Before handoff or push, run one aggregate gate:

```bash
pnpm verify branch
```

Do not also repeat every workspace command when `pnpm verify branch` already covers it. If the aggregate gate is unavailable or unnecessarily expensive for the change, run `pnpm verify changed` plus the specific affected workspace test and report that narrower verification.
