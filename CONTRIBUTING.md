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

| Command | Scope | Use |
| --- | --- | --- |
| `pnpm verify changed` | Committed, staged, and working-tree changes | Inner edit loop |
| `pnpm verify branch` | `origin/main...HEAD` | Before push or PR |
| `pnpm verify parallel` | Full repository, parallel | Fast full local gate |
| `pnpm verify ci` | Full repository, sequential and fail-fast | Diagnose CI failure order |

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
   - Vite client code: `import.meta.env.X` for exposed values
   - Python: `os.getenv("X")`, `os.environ["X"]`, or `os.environ.get("X")`
3. Add production configuration to the relevant deployment system.
4. Run:

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
