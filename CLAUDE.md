See @README.md for project overview and @package.json for root scripts.

# Build order

IMPORTANT: `packages/types` (and other packages) must be built before running `type-check` or `test` on any app. Always run `pnpm build` first if TS2307 errors appear on `@zapengine/*` imports.

# Per-app tooling

All apps — including analytics-engine (Python/FastAPI) — expose the same `pnpm <script>` surface (`dev`, `test`, `test:ci`, `lint`, `type-check`, `format`, `format:check`, `security:audit`, etc.). Under the hood, analytics-engine scripts wrap `uv run …`, but the CLI is uniform.

First-time Python setup: `pnpm --filter @zapengine/analytics-engine run build` (runs `uv sync --locked`). Frontend uses `pnpm test:unit` (not `pnpm test`) for unit tests.

# Code style

- Service/API logic: plain functions in `src/services/`, no classes
- Imports: ES modules only (`import/export`), not CommonJS
- Validation: Zod v4 (not v3 — import paths and APIs differ slightly)
- Path alias: `@/*` → `src/*` in frontend only
- ESLint: flat config (`eslint.config.mjs`), not legacy `.eslintrc`

# Key ports

| App              | Port |
| ---------------- | ---- |
| frontend (dev)   | 3000 |
| landing-page     | 3000 |
| account-engine   | 3004 |
| alpha-etl        | 3003 |
| analytics-engine | 8001 |
| frontend (E2E)   | 3099 |

# Database rules

- analytics-engine: read-only DB connection — NEVER add write operations here
- account-engine: dual Supabase clients — use anon client by default, service-role only for admin flows

# Pre-commit

Hooks run from the repo root via Turbo. To run local checks for a workspace manually, use `pnpm turbo run format lint:fix type-check deadcode dup:check test --filter=<workspace>`. For `analytics-engine`, include `sql:audit service-reachability pylint:duplicate-check` in the Turbo command when you need the full local gate.

# Turbo Remote Cache (local setup)

CI pushes build artifacts to Vercel Remote Cache. After merging main (lockfile / `package.json` changes), the next commit triggers a full cold-cache rebuild (~20s on `format:check`). To pull CI's cache locally and eliminate this penalty:

```bash
pnpm dlx turbo login   # one-time browser auth
pnpm dlx turbo link    # bind this repo to the Vercel team
```

After linking, Turbo checks remote cache on local misses — `pnpm check:local` stays fast even after dependency upgrades.

# Python environment (analytics-engine)

Requires Python 3.11+ and `uv`. Do not use `pip` — use `uv add` for new dependencies. Type checking is strict (mypy); all functions need type annotations.

# Analytics strategy measurement

After changing any backtesting strategy or signal component, start analytics-engine on port 8001 and run `pnpm --filter @zapengine/analytics-engine test:strategy-snapshot`. The checked-in 500-day snapshot fixture is pinned to a reference date; refresh it only after an intentional strategy behavior change with `pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/sweep_production_window.py --update-snapshot`.

# AI Tool Documentation

This repository uses **CLAUDE.md** as the single source of truth for AI assistant context.

| File        | Purpose                                  | Type                  |
| ----------- | ---------------------------------------- | --------------------- |
| `CLAUDE.md` | Canonical documentation for all AI tools | Regular file          |
| `AGENTS.md` | Codex/Github Copilot compatibility       | Symlink → `CLAUDE.md` |
| `GEMINI.md` | Google Gemini compatibility              | Symlink → `CLAUDE.md` |

**Adding new AI tools:** Create a new `{TOOL}.md` as a symlink to `CLAUDE.md` for consistency.
