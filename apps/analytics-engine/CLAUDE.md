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

## DB URLs in tests vs snapshot

`test:ci` runs two phases with different DB needs:

| Phase | DB URL | Schema needed |
| --- | --- | --- |
| `run-tests-precommit.sh` → pytest | `TEST_DATABASE_URL` / `DATABASE_INTEGRATION_URL` → local pg container | Minimal — bootstrapped by `scripts/db/bootstrap-integration-db.sql` |
| `test:strategy-snapshot:fast` → `TestClient(app)` POST `/api/v3/backtesting/compare` | `DATABASE_READ_ONLY_URL` (via `settings.effective_database_url`) | Full production `alpha_raw.*` schema + 500-day BTC time-series |

In CI, `DATABASE_READ_ONLY_URL` is a GitHub Actions secret pointing at the Supabase **read-only** replica. The snapshot fixture (`tests/fixtures/strategy_performance_snapshot_500d.json`) is generated from production data, so the snapshot phase only produces matching numbers when run against that same data.

**Required CI secret:** `DATABASE_READ_ONLY_URL` — Supabase read-only role DSN. Without it the `lint-test` job will fail at the snapshot phase.

# Strategy iteration

When working on backtesting strategies (anything under `src/services/backtesting/`), see [src/services/backtesting/CLAUDE.md](./src/services/backtesting/CLAUDE.md) for the iteration log, attribution conventions, and strategy-related commands.

Do not duplicate strategy iteration content here — that file is the canonical home.

# IMPORTANT: Do not add deduplication to `daily_portfolio_snapshots`

Never add `ROW_NUMBER()`, `PARTITION BY id_raw`, or `DISTINCT ON (id_raw)` to the `daily_portfolio_snapshots` MV.
DeBank's `id_raw` is protocol-level, not position-level — multiple distinct positions legitimately share the same `id_raw`.
All records in a batch are valid; there is no duplicate data to remove.
See `migrations/015_simplify_daily_portfolio_snapshots.sql`.
Regression guard: `tests/test_safeguards_deduplication.py` will fail if incorrect dedup is introduced.

# Import conventions

- Routers: `src.api.routers.*` (canonical)
- Strategies: `src.services.strategy.*` (canonical)

# Dead-code policy

Two enforced checks on every push:

- `uv run python scripts/quality/check_service_reachability.py` — rejects unreachable `*ServiceDep` bindings
- `uv run vulture src/ vulture_whitelist.py --min-confidence 80` — symbol-level unused detection (weekly audit drops to 60)

Every entry in `vulture_whitelist.py` must carry an inline reason. Removing a module requires removing its whitelist entries in the same PR.
