See @README.md for project overview.

# Commands

Same `pnpm <script>` surface as the rest of the monorepo — scripts wrap `uv run …`:

- `pnpm --filter @zapengine/analytics-engine dev` — start server (uvicorn, hot reload)
- `pnpm --filter @zapengine/analytics-engine test` — run pytest via `scripts/ci/run-tests-precommit.sh`
- `pnpm --filter @zapengine/analytics-engine lint` / `format` — ruff + mypy
- `pnpm --filter @zapengine/analytics-engine build` — first-time setup (`uv sync --locked`)
- `pnpm --filter @zapengine/analytics-engine security:audit` — `pip-audit` via uvx

From inside this directory, drop the `--filter …` prefix: `pnpm dev`, `pnpm test`, etc.

# Database

- This service is **read-only**. Never add INSERT/UPDATE/DELETE operations.
- SQL params MUST use `:snake_case` format — enforced by `scripts/quality/audit_sql_params.py`
- SQL queries live in `src/queries/sql/*.sql` (query registry pattern, not inline strings)
- Set `DATABASE_READ_ONLY=true` in `.env`

# Strategy iteration

When working on backtesting strategies (anything under `src/services/backtesting/`), see [src/services/backtesting/CLAUDE.md](./src/services/backtesting/CLAUDE.md) for the iteration log, attribution conventions, and strategy-related commands.

Do not duplicate strategy iteration content here — that file is the canonical home.

# IMPORTANT: Do not add deduplication to `daily_portfolio_snapshots`

Never add `ROW_NUMBER()`, `PARTITION BY id_raw`, or `DISTINCT ON (id_raw)` to the `daily_portfolio_snapshots` MV.
DeBank's `id_raw` is protocol-level, not position-level — multiple distinct positions legitimately share the same `id_raw`.
All records in a batch are valid; there is no duplicate data to remove.
See `migrations/015_simplify_daily_portfolio_snapshots.sql`.
Regression guard: `tests/test_safeguards_deduplication.py` will fail if incorrect dedup is introduced.

# AI Tool Documentation

This directory uses **CLAUDE.md** as the single source of truth for AI assistant context.

| File        | Purpose                                  | Type                  |
| ----------- | ---------------------------------------- | --------------------- |
| `CLAUDE.md` | Canonical documentation for all AI tools | Regular file          |
| `AGENTS.md` | Codex/Github Copilot compatibility       | Symlink → `CLAUDE.md` |
| `GEMINI.md` | Google Gemini compatibility              | Symlink → `CLAUDE.md` |

**Adding new AI tools:** Create a new `{TOOL}.md` as a symlink to `CLAUDE.md` for consistency.

# Import conventions

- Routers: `src.api.routers.*` (canonical)
- Strategies: `src.services.strategy.*` (canonical)

# Dead-code policy

Two enforced checks on every push:

- `uv run python scripts/quality/check_service_reachability.py` — rejects unreachable `*ServiceDep` bindings
- `uv run vulture src/ vulture_whitelist.py --min-confidence 80` — symbol-level unused detection (weekly audit drops to 60)

Every entry in `vulture_whitelist.py` must carry an inline reason. Removing a module requires removing its whitelist entries in the same PR.
