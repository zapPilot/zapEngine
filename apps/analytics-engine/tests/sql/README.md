# SQL Tests

SQL-level validation for portfolio queries.

## Quick Start

```bash
psql $DATABASE_URL -f tests/sql/fixtures/setup_test_data.sql
psql $DATABASE_URL -f tests/sql/test_query_fixes_validation.sql
psql $DATABASE_URL -f tests/sql/fixtures/teardown_test_data.sql
```

## Test Users

| User | Pattern | Purpose |
|------|---------|---------|
| A | Volatile, 30 days, 2 wallets | Multi-wallet aggregation |
| B | Stable, 10 days | Drawdown cycles |
| C | Edge cases, sparse | Division-by-zero |

## Tests

1. Multi-wallet aggregation (29 returns from 30 days)
2. Division-by-zero protection (NULLIF)
3. User isolation (shared wallet not leaked)
4. Drawdown running peak calculation
5. Underwater flag detection
6. Recovery point detection

All output PASS status.