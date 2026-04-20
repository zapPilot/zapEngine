See @README.md for project overview.

# Commands

Use `make`, not `pnpm`:

- `make dev` — start server (uvicorn, hot reload)
- `make test` — run pytest
- `make lint` / `make format` — ruff + mypy
- `make install` — uv sync (first-time setup)

# Database

- This service is **read-only**. Never add INSERT/UPDATE/DELETE operations.
- SQL params MUST use `:snake_case` format — enforced by `scripts/audit_sql_params.py`
- SQL queries live in `src/queries/sql/*.sql` (query registry pattern, not inline strings)
- Set `DATABASE_READ_ONLY=true` in `.env`

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
