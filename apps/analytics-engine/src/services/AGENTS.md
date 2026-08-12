See @../../AGENTS.md for analytics-engine rules.

# Analytics services

Business logic between FastAPI routers and the read-only SQL query layer.

## Boundaries

- Analytics-engine is read-only. Service code must not add `INSERT`, `UPDATE`, or `DELETE` behavior.
- Keep raw SQL in `src/queries/sql/`; service/query-builder code composes approved query inputs rather than embedding new SQL strings.
- This Python app already uses typed service classes wired through `dependencies.py`. Preserve that established DI architecture; the TypeScript app preference for plain-function services does not apply here.
- Strict mypy typing is required for public service behavior.
- Treat `alpha_raw.*` as a cross-app contract owned by alpha-etl; coordinate breaking schema changes.

## Placement

- `analytics/`: portfolio metrics and attribution.
- `backtesting/`: historical strategy execution and validation; read its nested `AGENTS.md` for iteration rules.
- `aggregators/`: rollups across portfolios/cohorts/regimes.
- `market/`: market-wide state and reference data.
- `portfolio/`: per-portfolio behavior.
- `strategy/`: user-facing strategy suggestion/configuration.
- `transformers/`: pure record-shape transforms.
- `query_builders/`: reusable SQL fragments consumed by registered queries.
- `shared/`: cross-cutting service helpers.

Prefer the existing domain folder over adding new loose files at `src/services/`.

## Verification traps

- Strategy/backtesting changes are guarded by `tests/test_strategy_performance_snapshot.py`; follow the nested backtesting instructions for intentional fixture changes.
- Local minimal Postgres fixtures do not contain the production `alpha_raw.*` history required by the strategy snapshot. Use the configured read-only snapshot data source for that gate.
- New DI services must be reachable through `dependencies.py`; the service-reachability gate rejects dead bindings.
