# Scripts

Developer utilities for analytics-engine. See individual scripts for usage details.

| Script | Purpose |
|--------|---------|
| `analyze_compare.py` | Strategy diagnostics — API-first compare analyzer |
| `attribution/sweep_hierarchical.py` | Hierarchical SPY/crypto attribution sweep across registered variants |
| `ci/run-tests-precommit.sh` | Local/CI test runner with PostgreSQL provisioning |
| `ci/check_required_dependencies.py` | Dependency contract validation |
| `db/bootstrap-integration-db.sh` | Integration test schema setup |
| `quality/audit_sql_params.py` | SQL parameter naming enforcement |
| `quality/check_service_reachability.py` | Service dependency validation |
| `market/analyze_btc_sentiment.py` | BTC price/sentiment charts |

Run the hierarchical attribution sweep with the API running on port 8001:

```bash
pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/sweep_hierarchical.py \
  --windows 2024,2025,2026,combined \
  --out attribution_$(date -I).md
```

See [CLAUDE.md](../CLAUDE.md) for full command reference.
