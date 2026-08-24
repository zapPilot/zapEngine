# Contributing to zapEngine

This monorepo uses `pnpm`, Turbo, TypeScript, and Python/FastAPI services. Start with root [AGENTS.md](./AGENTS.md), then read the nearest scoped instruction file in the area you are changing. `CLAUDE.md` and `GEMINI.md` exist only as compatibility entry points.

## Daily workflow

Install dependencies from the repository root:

```bash
pnpm install --frozen-lockfile
```

Run the usual development stack:

```bash
pnpm dev
```

For focused workspace tasks, use Turbo so internal package dependencies build first:

```bash
pnpm turbo run format lint:fix type-check deadcode dup:check test --filter=<workspace>
```

Do not replace that with direct filtered `type-check`, `lint`, or `test` commands when the workspace consumes internal packages.

For `analytics-engine`, include `sql:audit`, `service-reachability`, and `pylint:duplicate-check` when you need the full local service gate.

## Verification hierarchy

| Command                | Scope                                       | Use                       |
| ---------------------- | ------------------------------------------- | ------------------------- |
| `pnpm verify changed`  | Committed, staged, and working-tree changes | Inner edit loop           |
| `pnpm verify branch`   | `origin/main...HEAD`                        | Before push or PR         |
| `pnpm verify parallel` | Full repository, parallel                   | Fast full local gate      |
| `pnpm verify ci`       | Full repository, sequential and fail-fast   | Diagnose CI failure order |

All `pnpm verify` modes require a non-shallow clone. Run `git fetch --unshallow origin` first when necessary.

### Edit loop

1. Make the smallest coherent change.
2. Run `pnpm verify changed`.
3. When it fails, inspect `.ai-verify/result.json` and the referenced log under `.ai-verify/logs/`.
4. Fix only failures related to the current change.
5. Repeat until green.
6. Run `pnpm verify branch` before pushing.

Do not use `pnpm verify ci` as the normal edit loop; it is intentionally slower and sequential.

CI remains authoritative. GitHub splits the core checks into independently rerunnable jobs and runs security, coverage, dead-env, Docker, and deployment checks separately.

## Pre-commit

Pre-commit keeps checks fast: frozen-lockfile installation, repository drift checks, and staged ESLint/Prettier checks. It does not replace the branch or full verification gates.

## Adding an environment variable

1. Add the key to root `.env.example` with a short purpose comment.
2. Use the local runtime convention:
   - Node or server TypeScript: `process.env.X` or `process.env['X']`
   - Shared app client code: `getRuntimeEnv('VITE_X')` from app-core
   - Python: `os.getenv("X")`, `os.environ["X"]`, or `os.environ.get("X")`
3. Prefer a `VITE_*` key as the local source. Add a platform-prefixed override
   only when that deployment or runtime needs a different value.
4. Add production configuration to the relevant deployment system.
5. Run:

```bash
bash scripts/check-dead-env.sh
```

The checker validates both declared-but-unused and referenced-but-undeclared variables. Fly configuration drift is reported as a warning.

## Adding an HTTP route

1. Add the route in the service router or controller.
2. Keep service/API logic in plain functions under `src/services/`.
3. When another service or frontend consumes the response, add the Zod schema under `packages/types/src/api/` and the matching analytics Pydantic model where applicable.
4. Run:

```bash
pnpm contracts check
```

Use Zod v4. Do not add Swagger/OpenAPI scaffolding unless the task requires it.

## Adding a database migration

The root `supabase/` directory is the only active Supabase CLI workdir for the shared production project. Create a migration from the repository root:

```bash
supabase migration new <description>
```

Edit the generated `supabase/migrations/<timestamp>_<description>.sql`, open a PR, and merge it before applying it. The operator then runs locally:

```bash
supabase db push --dry-run
supabase db push
supabase migration list
```

Review the dry-run migration list before every push. Push exactly one migration at a time, and confirm that `LOCAL` and `REMOTE` match afterward. If the CLI is unavailable when authoring the file, use the UTC filename format `$(date -u +%Y%m%d%H%M%S)_<description>.sql`.

Migration SQL must use schema-qualified object names. Do not use `CREATE INDEX CONCURRENTLY` or `DROP INDEX CONCURRENTLY`: each migration and its history row run in one implicit transaction. Express `pg_cron` changes through `cron.schedule`, `cron.alter_job`, or `cron.unschedule` calls inside a migration. A destructive migration requires its own PR and must never share a push with another migration.

Do not change the schema through the Supabase Dashboard SQL Editor or MCP `apply_migration` / `execute_sql`, except for a documented emergency. Do not add migrations under `apps/*/migrations/` or `apps/podcast-pipeline/supabase/migrations/`, run `supabase init` anywhere in this repository, or modify a migration that has already been pushed.

After any emergency out-of-band schema change, reconcile it immediately with `supabase db pull <description>` and commit the resulting new migration. Database credentials belong in the operator's keychain or temporary shell environment, never in `.env` or `.env.example`.

## Adding an app or package

1. Add the workspace to `pnpm-workspace.yaml` when needed.
2. Provide the common scripts that apply: `build`, `dev`, `test`, `test:ci`, `lint`, `type-check`, `format`, `format:check`, and `security:audit`.
3. Confirm the task graph in `turbo.json`.
4. Add a concise `README.md` for setup and a focused scoped instruction file only for real architecture boundaries or recurring traps.
5. Keep cross-cutting app rules in [apps/AGENTS.md](./apps/AGENTS.md), package rules in [packages/AGENTS.md](./packages/AGENTS.md), and repository-wide principles in root [AGENTS.md](./AGENTS.md).

Do not duplicate configuration that is already enforced by code, tests, or checked-in tooling.

## Python setup

`analytics-engine` requires Python 3.11+ and `uv`. Do not use `pip` for project dependencies.

First-time setup:

```bash
pnpm --filter @zapengine/analytics-engine run build
```

Add dependencies with `uv add`. Type checking is strict and functions require annotations.

## Strategy iteration

Backtesting guidance lives beside the code in `apps/analytics-engine/src/services/backtesting/CLAUDE.md`. For intentional strategy behavior changes, run:

```bash
pnpm --filter @zapengine/analytics-engine test:strategy-snapshot:fast
```

Refresh the checked-in snapshot only after an intentional behavior change.
