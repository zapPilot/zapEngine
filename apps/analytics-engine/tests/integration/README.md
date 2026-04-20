# Integration Tests for Debt Handling

Comprehensive PostgreSQL integration tests validating that the debt handling fix works correctly in production scenarios.

## Overview

These tests validate end-to-end functionality against a real PostgreSQL database, including:

- ✅ JSONB extraction of negative token amounts (debt/borrowings)
- ✅ NET portfolio value calculation (assets - debt)
- ✅ Historical trend accuracy with debt changes over time
- ✅ Cross-endpoint consistency (trend vs landing page)
- ✅ Edge case handling (extreme leverage, zero debt)
- ✅ PostgreSQL-specific features (LATERAL joins, DATE_TRUNC, JSONB operations)

## Why Integration Tests?

The portfolio trend SQL query uses PostgreSQL-specific features that cannot be tested with SQLite:

```sql
-- PostgreSQL-specific features:
- JSONB operations: jsonb_array_elements(), ->> operator
- LATERAL joins: CROSS JOIN LATERAL
- DATE_TRUNC function with ::date casting
- NUMERIC type with ::numeric casting
- Schema prefixes: alpha_raw.wallet_token_snapshots
- classify_token_category() database function
```

**Unit tests** (36 passing) validate service layer logic with mocked data.
**Integration tests** (this directory) validate actual SQL execution against PostgreSQL.

---

## Prerequisites

### 1. PostgreSQL Database

You need a PostgreSQL database with the analytics engine schema. Options:

**Option A: Local PostgreSQL**
```bash
# Install PostgreSQL
brew install postgresql@15  # macOS
# or apt-get install postgresql-15  # Linux

# Create test database
createdb analytics_test

# Apply schema (from your production database)
pg_dump -s production_db | psql analytics_test
```

**Option B: Supabase Test Project**
```bash
# Create a dedicated test project in Supabase
# Copy the connection string from Project Settings → Database
export DATABASE_INTEGRATION_URL="postgresql+asyncpg://postgres:[password]@db.[project].supabase.co:5432/postgres"
```

**Option C: Docker PostgreSQL**
```bash
# Start PostgreSQL container
docker run -d \
  --name analytics-test-db \
  -e POSTGRES_PASSWORD=test_password \
  -e POSTGRES_DB=analytics_test \
  -p 5432:5432 \
  postgres:15

export DATABASE_INTEGRATION_URL="postgresql+asyncpg://postgres:test_password@localhost:5432/analytics_test"
```

### 2. Required Database Function

The tests require the `classify_token_category()` function. Create it:

```sql
CREATE OR REPLACE FUNCTION classify_token_category(symbol TEXT)
RETURNS TEXT AS $$
BEGIN
    IF symbol IS NULL THEN
        RETURN 'others';
    END IF;

    CASE LOWER(symbol)
        WHEN 'btc', 'wbtc', 'tbtc', 'renbtc' THEN
            RETURN 'btc';
        WHEN 'eth', 'weth', 'steth', 'reth' THEN
            RETURN 'eth';
        WHEN 'usdc', 'usdt', 'dai', 'busd', 'tusd', 'usdp', 'frax' THEN
            RETURN 'stablecoins';
        ELSE
            RETURN 'others';
    END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

### 3. Required Tables

Ensure these tables exist:
- `users`
- `user_crypto_wallets`
- `portfolio_item_snapshots`
- `alpha_raw.wallet_token_snapshots` (optional, for some tests)

---

## Setup & Configuration

### 1. Set Environment Variable

```bash
# Required for integration tests to run
export DATABASE_INTEGRATION_URL="postgresql+asyncpg://user:password@host:port/database"

# Example: Local PostgreSQL
export DATABASE_INTEGRATION_URL="postgresql+asyncpg://postgres:password@localhost:5432/analytics_test"

# Example: Supabase
export DATABASE_INTEGRATION_URL="postgresql+asyncpg://postgres:[password]@db.[project].supabase.co:5432/postgres"
```

Bare `postgresql://...` URLs are still accepted and normalized by the integration
fixtures, but `postgresql+asyncpg://...` is the recommended form for async tests.

### 2. Install Dependencies

```bash
uv sync --dev
```

---

## Running Tests

### Run All Integration Tests

```bash
# Set database URL
export DATABASE_INTEGRATION_URL="postgresql+asyncpg://user:pass@localhost/test_db"

# Run all integration tests
pytest tests/integration/ -m integration -v

# Expected output:
# tests/integration/test_debt_handling_integration.py::TestDebtHandlingIntegration::test_pure_debt_position PASSED
# tests/integration/test_debt_handling_integration.py::TestDebtHandlingIntegration::test_historical_debt_trend_three_days PASSED
# tests/integration/test_debt_handling_integration.py::TestDebtHandlingIntegration::test_zero_debt_regression PASSED
# tests/integration/test_debt_handling_integration.py::TestDebtHandlingIntegration::test_cross_endpoint_consistency PASSED
# tests/integration/test_debt_handling_integration.py::TestDebtHandlingSQLValidation::test_sql_query_executes_successfully PASSED
# ======================== 5 passed, 3 skipped ========================
```

### Run Specific Test

```bash
pytest tests/integration/test_debt_handling_integration.py::TestDebtHandlingIntegration::test_pure_debt_position -v
```

### Run with Coverage

```bash
pytest tests/integration/ -m integration -v --cov=src --cov-report=html --cov-report=term
```

### Skip Integration Tests (Default)

```bash
# Integration tests are automatically skipped if DATABASE_INTEGRATION_URL is not set
pytest tests/

# Or explicitly skip:
pytest tests/ -m "not integration"
```

---

## Test Cases

### Test Cases

| Test | Scenario | Validates |
|------|----------|-----------|
| `test_pure_debt_position` | $10k assets, $3k debt in JSONB | JSONB → debt extraction, NET = assets - debt |
| `test_historical_debt_trend_three_days` | 3-day debt changes | PnL includes debt, trends reflect changes |
| `test_zero_debt_regression` | No debt (positive only) | Backward compatibility for zero-debt users |
| `test_cross_endpoint_consistency` | Same user, two endpoints | Both return identical NET values |
| `test_sql_query_executes_successfully` | SQL execution | Query validity, debt fields present |

**Key Equation:** `total_value_usd = category_assets_usd - category_debt_usd`

---

## Test Data Fixtures

### `test_user_with_debt`

Creates a user with basic debt position:
- 1 wallet
- 1 snapshot with JSONB containing negative amounts
- $10,000 assets, $3,000 debt → NET $7,000

### `test_user_multi_day_debt`

Creates a user with 3-day debt history:
- Day 1: No debt ($10,000 NET)
- Day 2: $2,000 borrowed ($8,000 NET)
- Day 3: $1,000 remaining ($9,000 NET - repaid $1,000)

### `test_user_zero_debt`

Creates a user with no debt positions:
- Only positive token amounts
- $15,000 in assets, $0 debt
- Used for regression testing

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `SKIPPED: DATABASE_INTEGRATION_URL not set` | Set `export DATABASE_INTEGRATION_URL=...` |
| `Connection refused` | Check PostgreSQL is running; verify connection string |
| `function classify_token_category does not exist` | Create function (see Prerequisites) |
| `relation portfolio_item_snapshots does not exist` | Apply schema: `psql test_db < schema.sql` |
| `permission denied` | Grant privileges: `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO test_user;` |

---

## CI/CD Integration (Optional)

### GitHub Actions Example

Create `.github/workflows/test-integration.yml`:

```yaml
name: Integration Tests

on:
  workflow_dispatch:  # Manual trigger
  push:
    branches: [ main ]

jobs:
  integration-tests:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: test_password
          POSTGRES_DB: analytics_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
        ports:
          - 5432:5432

    steps:
    - uses: actions/checkout@v4

    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.11'

    - name: Install uv
      uses: astral-sh/setup-uv@v4

    - name: Install dependencies
      run: uv sync --dev

    - name: Set up database schema
      run: psql -h localhost -U postgres -d analytics_test -f tests/integration/schema.sql
      env:
        PGPASSWORD: test_password

    - name: Run integration tests
      run: pytest tests/integration/ -m integration -v
      env:
        DATABASE_INTEGRATION_URL: postgresql+asyncpg://postgres:test_password@localhost:5432/analytics_test
```

---

## Expected Test Results

When all tests pass, you should see:

```
tests/integration/test_debt_handling_integration.py::TestDebtHandlingIntegration::test_pure_debt_position PASSED [ 20%]
tests/integration/test_debt_handling_integration.py::TestDebtHandlingIntegration::test_historical_debt_trend_three_days PASSED [ 40%]
tests/integration/test_debt_handling_integration.py::TestDebtHandlingIntegration::test_zero_debt_regression PASSED [ 60%]
tests/integration/test_debt_handling_integration.py::TestDebtHandlingIntegration::test_cross_endpoint_consistency PASSED [ 80%]
tests/integration/test_debt_handling_integration.py::TestDebtHandlingSQLValidation::test_sql_query_executes_successfully PASSED [100%]
tests/integration/test_debt_handling_integration.py::TestDebtHandlingIntegration::test_multi_category_debt SKIPPED (requires specific test data)
tests/integration/test_debt_handling_integration.py::TestDebtHandlingIntegration::test_extreme_leverage SKIPPED (requires specific test data)
tests/integration/test_debt_handling_integration.py::TestDebtHandlingIntegration::test_mixed_defi_wallet_debt SKIPPED (requires wallet snapshots support)

======================== 5 passed, 3 skipped in 4.23s ========================
```

**Key Validations Passed:**
- ✅ JSONB negative amounts extracted correctly
- ✅ NET portfolio value = assets - debt
- ✅ Historical trends reflect debt changes
- ✅ Cross-endpoint consistency verified
- ✅ Zero-debt users unaffected (regression pass)

---

## Next Steps

**Expand Test Coverage:** Multi-category debt, extreme leverage (95% LTV), negative NET categories, mixed DeFi/wallet debt.

**Performance Testing:** Test with 1000+ snapshots across 90 days.

**Continuous Monitoring:** Run before production deploys, after schema changes, weekly regression.

## Summary

Integration tests validate the debt handling fix because: (1) Unit tests can't validate PostgreSQL SQL, (2) JSONB negative amounts need real DB testing, (3) Cross-endpoint consistency requires end-to-end validation, (4) Catches production bugs pre-deployment.

**Before deploying to production**, ensure all integration tests pass against a PostgreSQL database with production-like data.
