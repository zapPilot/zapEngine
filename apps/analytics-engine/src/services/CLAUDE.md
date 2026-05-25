See @../../CLAUDE.md for app-level conventions.

# services (analytics-engine)

Business logic layer between FastAPI routers (`src/api/`) and SQL queries (`src/queries/`). Routers thin out into services, which compose calls across the sub-packages below.

## Sub-packages

| Folder              | Role                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `analytics/`        | Portfolio analytics — returns, volatility, drawdown, attribution                                      |
| `backtesting/`      | Backtest engine: event runner, decision policy, allocation intent, snapshot validation. See its CLAUDE.md. |
| `aggregators/`      | Higher-order roll-ups across portfolios / cohorts / regimes                                           |
| `market/`           | Market-level data (BTC dominance, regime, fear/greed)                                                 |
| `portfolio/`        | Per-portfolio rule engine (~575 LOC `portfolio.py`)                                                   |
| `strategy/`         | Strategy suggestion service (per-user allocation suggestion)                                          |
| `transformers/`     | Pure record-shape transformations (DB row → API model)                                                |
| `query_builders/`   | Composable SQL fragment builders (not raw queries — those live in `src/queries/sql/`)                 |
| `interfaces/`       | Protocols / Abstract base classes for dependency injection                                            |
| `shared/`           | Cross-cutting helpers (date windowing, decimal helpers, currency)                                     |
| `dependencies.py`   | FastAPI dependency-injection wiring (513 LOC)                                                         |
| `exceptions.py`     | Service-layer typed exceptions                                                                        |
| `yield_return_service.py` | Yield return computation (loose file — candidate for `analytics/` move)                          |

## When to add a new service

| Question                                                          | Yes → go to            |
| ----------------------------------------------------------------- | ---------------------- |
| Computes performance metrics for one portfolio?                   | `analytics/`           |
| Runs a strategy decision over historical events?                  | `backtesting/`         |
| Returns market-wide state (not user-scoped)?                      | `market/`              |
| Rolls up across many portfolios/users?                            | `aggregators/`         |
| Suggests an allocation for a user?                                | `strategy/`            |
| Just converts row shapes — no I/O, no math?                       | `transformers/`        |
| Builds a SQL fragment composed by multiple queries?               | `query_builders/`      |
| Cross-cutting helper used by ≥2 packages above?                   | `shared/`              |

If none fit, propose a new sub-package before dropping a loose file at the `services/` root.

## Conventions

- **Read-only DB access** — analytics-engine never writes. If you find yourself wanting to `INSERT/UPDATE/DELETE`, you are in the wrong app.
- **Strict typing** — mypy is in strict mode; every function needs annotations.
- **Pure functions where possible** — analytics services compose readonly inputs; mutate nothing.
- **Snapshot fixtures gate behaviour** — the in-process snapshot test (`tests/test_strategy_performance_snapshot.py`) is the regression guard for strategy / backtesting changes. See backtesting's CLAUDE.md for fixture refresh procedure.
- **alpha_raw.* contracts** — many queries depend on tables in the `alpha_raw` schema (owned by alpha-etl). Coordinate breaking changes across repos.

## Gotchas

- `dependencies.py` (513 LOC) is the FastAPI DI wiring. If you add a new service class, register it here.
- The 10 largest service files (event_runner.py 1278L, decision_policy.py 729L, etc.) carry section maps as docstring TOCs — use them when navigating; Wave 3.4 added these but did **not** refactor internals.
- `yield_return_service.py` is a loose file; if you touch it, consider moving into `analytics/` and updating imports.
- Local pg containers will fail the snapshot gate because they lack `alpha_raw.*` series — point `DATABASE_READ_ONLY_URL` at the Supabase read-only replica.
