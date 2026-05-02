# Integration Tests

PostgreSQL integration tests for debt handling. Requires `DATABASE_INTEGRATION_URL` env var.

## Prerequisites

- PostgreSQL with analytics schema
- `classify_token_category()` function
- Tables: `users`, `user_crypto_wallets`, `portfolio_item_snapshots`

## Setup

```bash
export DATABASE_INTEGRATION_URL="postgresql+asyncpg://user:pass@host/db"
```

## Running

```bash
pytest tests/integration/ -m integration -v
# Skipped if DATABASE_INTEGRATION_URL not set
```

## Test Cases

| Test | Validates |
|------|-----------|
| `test_pure_debt_position` | JSONB debt extraction, NET = assets - debt |
| `test_historical_debt_trend` | PnL includes debt changes |
| `test_zero_debt_regression` | Zero-debt users unaffected |
| `test_cross_endpoint_consistency` | Both endpoints return same NET |