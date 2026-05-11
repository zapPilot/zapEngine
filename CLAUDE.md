See @README.md for project overview and @package.json for root scripts.

# Build order

Internal packages (`packages/*`) are built automatically by `pnpm check:local`, `check:ci`, and `check:ci:core` via the `prebuild:packages` step. `pnpm contracts:check` also runs that prebuild before exporting schemas. When invoking type-check or tests directly:

- **Prefer**: `pnpm type-check` / `pnpm test` from the root (Turbo handles `^build` upstream deps).
- **If TS2307 appears** on `@zapengine/*` imports when running `pnpm --filter X type-check` directly: run `pnpm prebuild:packages` first.

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

The snapshot gate runs automatically as part of `pnpm --filter @zapengine/analytics-engine test` and `test:ci` (in-process; no server boot required). The in-process gate boots the FastAPI app via `TestClient(app)`, which connects to `DATABASE_READ_ONLY_URL`. In CI this must point at the Supabase read-only replica (set as a GitHub Actions secret `DATABASE_READ_ONLY_URL`); a local pg container does not contain the production `alpha_raw.*` time-series the fixture was generated from. If you intentionally change strategy behavior, refresh the fixture: `pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/sweep_production_window.py --update-snapshot` (this still requires the server on port 8001 because update mode uses HTTP mode).

# AI Tool Documentation

This repository uses **CLAUDE.md** as the single source of truth for AI assistant context.

| File        | Purpose                                  | Type                  |
| ----------- | ---------------------------------------- | --------------------- |
| `CLAUDE.md` | Canonical documentation for all AI tools | Regular file          |
| `AGENTS.md` | Codex/Github Copilot compatibility       | Symlink → `CLAUDE.md` |
| `GEMINI.md` | Google Gemini compatibility              | Symlink → `CLAUDE.md` |

**Adding new AI tools:** Create a new `{TOOL}.md` as a symlink to `CLAUDE.md` for consistency.

Do not create git worktrees unless explicitly requested by the user. Work directly in the current checkout by default.
