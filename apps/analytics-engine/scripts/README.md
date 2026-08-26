# Scripts

Developer utilities for analytics-engine. See individual scripts for usage
details.

| Script | Purpose |
|--------|---------|
| `analyze_compare.py` | Strategy diagnostics and fixture constraint validation |
| `attribution/sweep_production_window.py` | 500-day production snapshot collection/check/update |
| `ci/run-tests-precommit.sh` | Local/CI test runner with PostgreSQL provisioning |
| `ci/check_required_dependencies.py` | Dependency contract validation |
| `db/bootstrap-integration-db.sh` | Integration test schema setup |
| `quality/audit_sql_params.py` | SQL parameter naming enforcement |
| `quality/check_service_reachability.py` | Service dependency validation |
| `market/analyze_btc_sentiment.py` | BTC price/sentiment charts |

The canonical validation command lives in
[`src/services/backtesting/COMMANDS.md`](../src/services/backtesting/COMMANDS.md).
Use the current date for its `<to-date>` placeholder.
