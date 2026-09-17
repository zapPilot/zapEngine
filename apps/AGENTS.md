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

## New TypeScript server app layout

Default layout for **new** TypeScript server apps. Existing apps are not required to retrofit it.

```text
src/
├── main.ts       # process bootstrap
├── app.ts        # framework setup and route registration
├── config/       # typed env and runtime configuration
├── routes/       # HTTP boundary; no business logic
├── services/     # domain logic as plain functions
├── lib/          # reusable infrastructure helpers
├── common/       # shared errors, validation, and guards
├── middleware/   # framework middleware, when needed
├── types/        # app-local types
└── modules/      # only for large, cohesive features
```

- Parse environment variables once in `config/env.ts`, preferably with Zod.
- Route files map to URL resources and delegate business logic to `services/`.
- Prefer plain functions over service classes.
- Put cross-app contracts in `packages/types`, not local `types/`.
- Prefer `lib/` over adding a second generic `utils/` directory.
- Start flat. Introduce `modules/<feature>/` only when a feature has several tightly related files and a clear internal boundary.
- Follow framework conventions for frontend apps instead of applying this server layout.

Existing exceptions are intentional: account-engine retains older DI/classes, alpha-etl is pipeline-module oriented, and podcast-pipeline is small enough to remain flat. Do not restructure them in unrelated changes.

## Architecture boundaries

- `analytics-engine` decides allocation strategy and does not build transactions.
- `account-engine` owns identity, persistence, and plan orchestration, but identity code does not plan money movement.
- App clients confirm, sign, and broadcast prepared transactions; they do not independently rebuild authoritative plans.
- A money-moving flow must have one authoritative planning path.
- `@zapengine/intent-engine` converts normalized intent into `PreparedTransaction[]` and remains pure.
- Analytics does not know execution details; identity/persistence code does not construct plans. Only plan-orchestration composes strategy and intent construction downward.

## Unattended wallet policy

Ordinary EIP-7702 delegation is not a scoped session key. Unattended sessions
require on-chain target/method restrictions, native/ERC-20 spend limits, expiry,
and user revocation independent of the backend. Revalidate vendor contracts and
complete prototype/audit review before enabling policy-bounded automation.

## Verification

Use the repository root verification policy. The app-specific aggregate commands
are:

```bash
pnpm verify branch
pnpm verify changed
```
