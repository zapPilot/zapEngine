# Scripts

Developer utilities for analytics-engine. See individual scripts for usage details.

| Script | Purpose |
|--------|---------|
| `analyze_compare.py` | Strategy diagnostics — API-first compare analyzer |
| `attribution/sweep_hierarchical.py` | Hierarchical SPY/crypto attribution sweep across registered variants |
| `attribution/validate_hierarchical_events.py` | Fixed hierarchical regression event validation report |
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

Run the fixed hierarchical regression event set after strategy iterations:

```bash
pnpm --filter @zapengine/analytics-engine exec uv run python scripts/attribution/validate_hierarchical_events.py \
  --out hierarchical_validation_$(date -I).md
```

This validator posts one compare request for
`dma_fgi_hierarchical_spy_crypto`, resolves the actual event date inside each
fixture search window, then checks the expected routing behavior. It is
complementary to the attribution sweep: this checks known correctness
invariants, while the sweep checks whether tactics contribute to performance.
