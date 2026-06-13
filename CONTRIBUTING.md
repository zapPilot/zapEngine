# Contributing to zapEngine

This monorepo uses `pnpm`, Turbo, TypeScript, and Python/FastAPI services. Start with the root `CLAUDE.md` for project context, then read any app-level `CLAUDE.md` in the area you are changing. `AGENTS.md` and `GEMINI.md` are compatibility symlinks to the same root guidance.

## Daily Workflow

Install dependencies from the repository root:

```bash
pnpm install --frozen-lockfile
```

Run the usual development stack:

```bash
pnpm dev
```

Run the local quality gate before opening a PR:

```bash
pnpm verify
```

The pre-commit hook runs the same local gate through Turbo. For focused workspace checks, prefer root Turbo commands such as:

```bash
pnpm turbo run format lint:fix type-check deadcode dup:check test --filter=<workspace>
```

For `analytics-engine`, include `sql:audit service-reachability pylint:duplicate-check` when you need the full local service gate.

## AI Assistant Onboarding

See [CLAUDE.md](./CLAUDE.md) for AI-assistant context. Read the relevant app-level `CLAUDE.md` before changing app-specific code; for backtesting work, the canonical home is [apps/analytics-engine/src/services/backtesting/CLAUDE.md](./apps/analytics-engine/src/services/backtesting/CLAUDE.md).

## Adding An Env Var

1. Add the key to root `.env.example` with a short comment explaining its purpose.
2. Reference the variable with the local convention:
   - Node or server-side TypeScript: `process.env.X` or `process.env['X']`
   - Vite frontend code: `import.meta.env.X` for client-exposed variables
   - Python: `os.getenv("X")`, `os.environ["X"]`, or `os.environ.get("X")`
3. If production needs the variable, add it to the relevant deployment system such as `apps/*/fly.toml` or Vercel project env settings.
4. Run:

```bash
bash scripts/check-dead-env.sh
```

The env checker validates both directions: declared variables must be used, and static code references must be declared. Fly config drift is reported as a warning.

## Adding An HTTP Route

1. Add the route in the service router or controller file.
2. Keep service/API logic in plain functions under `src/services/`; do not introduce classes for service logic.
3. If another service or frontend consumes the response, add a Zod schema under `packages/types/src/api/` and the matching analytics Pydantic model where applicable.
4. Run:

```bash
pnpm contracts:check
```

Use Zod v4 imports and APIs. Do not add Swagger/OpenAPI scaffolding unless the task calls for it.

## Adding An App Or Package

1. Add the workspace to `pnpm-workspace.yaml` when needed.
2. Include the standard package scripts: `build`, `dev`, `test`, `test:ci`, `lint`, `type-check`, `format`, `format:check`, and `security:audit` where applicable.
3. Confirm Turbo tasks fit the existing pipeline in `turbo.json`.
4. Internal packages under `packages/*` are built by `pnpm prebuild:packages`, which is already wired into `verify`, `verify:ci`, and `contracts:check`.

## Common Gotchas

Cross-cutting conventions (Python/uv, ESLint flat config, path aliases, read-only analytics DB, dual Supabase clients, frontend `test:unit` vs `test`) live in root [CLAUDE.md](./CLAUDE.md). App-specific gotchas (e.g. `alpha-etl` Vitest mocks, `macro_fear_greed` field name) live in each app's `CLAUDE.md`.

## Strategy Iteration

Backtesting strategy and signal code has its own guidance in `apps/analytics-engine/src/services/backtesting/CLAUDE.md`. If a PR intentionally changes strategy behavior, run:

```bash
pnpm --filter @zapengine/analytics-engine test:strategy-snapshot:fast
```

Only refresh the checked-in snapshot after an intentional behavior change.
