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

Run fixture constraint validation after strategy iterations:

```bash
pnpm --filter @zapengine/analytics-engine exec uv run python scripts/analyze_compare.py \
  --saved-config-id dma_fgi_portfolio_rules \
  --config-id dma_fgi_portfolio_rules \
  --from-date 2025-01-01 \
  --to-date 2026-04-10 \
  --format markdown
```
