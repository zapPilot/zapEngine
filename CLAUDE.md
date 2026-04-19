See @README.md for project overview and @package.json for root scripts.

# Build order

IMPORTANT: `packages/types` (and other packages) must be built before running `type-check` or `test` on any app. Always run `pnpm build` first if TS2307 errors appear on `@zapengine/*` imports.

# Per-app tooling

analytics-engine is Python (FastAPI). Use `make <command>` instead of `pnpm`:
- `make dev` — start dev server
- `make test` — run pytest
- `make lint` — ruff + mypy
- `make install` — uv sync (first time setup)

All TypeScript apps use `pnpm <script>`. Frontend uses `pnpm test:unit` (not `pnpm test`) for unit tests.

# Code style

- Service/API logic: plain functions in `src/services/`, no classes
- Imports: ES modules only (`import/export`), not CommonJS
- Validation: Zod v4 (not v3 — import paths and APIs differ slightly)
- Path alias: `@/*` → `src/*` in frontend only
- ESLint: flat config (`eslint.config.mjs`), not legacy `.eslintrc`

# Key ports

| App | Port |
|---|---|
| frontend (dev) | 3000 |
| landing-page | 3000 |
| account-engine | 3004 |
| alpha-etl | 3003 |
| analytics-engine | 8001 |
| frontend (E2E) | 3099 |

# Database rules

- analytics-engine: read-only DB connection — NEVER add write operations here
- account-engine: dual Supabase clients — use anon client by default, service-role only for admin flows

# Pre-commit

Hooks run per-workspace in parallel. Each app has its own `pre-commit` script. To run a specific app's checks manually: `sh apps/<name>/pre-commit` or `pnpm pre-commit` from the app directory.

# Python environment (analytics-engine)

Requires Python 3.11+ and `uv`. Do not use `pip` — use `uv add` for new dependencies. Type checking is strict (mypy); all functions need type annotations.
