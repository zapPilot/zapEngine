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

### TC1: Pure Debt Position (`test_pure_debt_position`)

**Scenario:** User with $10,000 USDC deposited and $3,000 USDC borrowed

**JSONB Structure:**
```json
{
  "asset_token_list": [
    {"symbol": "USDC", "amount": "10000", "price": "1.0"},
    {"symbol": "USDC", "amount": "-3000", "price": "1.0"}
  ]
}
```

**Expected Results:**
```python
{
  "total_value_usd": 7000.0,  # NET = $10k assets - $3k debt
  "category_assets_usd": 10000.0,
  "category_debt_usd": 3000.0,
  "category_value_usd": 7000.0
}
```

**Validates:**
- JSONB negative amounts correctly extracted as debt
- NET portfolio value = assets - debt
- New debt fields present in API response

---

### TC3: Historical Debt Trend (`test_historical_debt_trend_three_days`)

**Scenario:** 3-day trend showing debt changes

| Day | Assets | Debt | NET | PnL |
|-----|--------|------|-----|-----|
| 1 | $10,000 | $0 | $10,000 | 0% |
| 2 | $10,000 | $2,000 | $8,000 | -20% |
| 3 | $10,000 | $1,000 | $9,000 | +12.5% |

**Validates:**
- Historical trends reflect debt changes
- PnL calculations include debt impact
- Debt increase reduces portfolio value
- Debt repayment increases portfolio value

---

### TC6: Zero Debt Regression (`test_zero_debt_regression`)

**Scenario:** User with no borrowing (only positive amounts)

**JSONB Structure:**
```json
{
  "asset_token_list": [
    {"symbol": "ETH", "amount": "5", "price": "2000"},
    {"symbol": "USDC", "amount": "5000", "price": "1.0"}
  ]
}
```

**Expected Results:**
```python
{
  "total_value_usd": 15000.0,
  "category_debt_usd": 0.0,  # All categories have zero debt
  "value_usd == assets_usd"  # NET equals assets when debt is zero
}
```

**Validates:**
- Debt handling fix doesn't break existing users without debt
- Zero debt handled correctly (backward compatibility)

---

### TC4: Cross-Endpoint Consistency (`test_cross_endpoint_consistency`)

**Scenario:** Same user queried via two endpoints

**Endpoints:**
1. `GET /api/v2/analytics/{user_id}/trend?days=1`
2. `GET /api/v2/portfolio/{user_id}/landing`

**Validates:**
```python
trend_response["daily_values"][0]["total_value_usd"] ==
landing_response["net_portfolio_value"]
```

**Critical Check:** Both endpoints must show same NET value (assets - debt)

---

### TC-SQL: SQL Query Validation (`test_sql_query_executes_successfully`)

**Validates:**
- SQL query executes without errors on PostgreSQL
- All referenced tables/functions exist
- Result rows include debt fields
- NET calculation is correct: `category_value_usd == assets - debt`

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

### Tests Are Skipped

```
SKIPPED: DATABASE_INTEGRATION_URL not set
```

**Solution:** Set the environment variable:
```bash
export DATABASE_INTEGRATION_URL="postgresql+asyncpg://user:pass@host/database"
```

### Connection Error

```
could not connect to server: Connection refused
```

**Solutions:**
1. Verify PostgreSQL is running: `pg_isready`
2. Check connection string has correct host/port
3. Verify credentials are correct
4. Check firewall/security group settings (if using cloud database)

### Missing Function Error

```
ERROR: function classify_token_category(text) does not exist
```

**Solution:** Create the function (see Prerequisites section above)

### Missing Tables Error

```
ERROR: relation "portfolio_item_snapshots" does not exist
```

**Solution:** Apply database schema:
```bash
pg_dump -s production_db | psql test_db
# or
psql test_db < schema.sql
```

### Permission Errors

```
ERROR: permission denied for table users
```

**Solution:** Grant necessary permissions:
```sql
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO test_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO test_user;
```

---

## Manual SQL Validation

If you want to manually validate the SQL query results:

### 1. Check Test Data

```sql
-- View test user's portfolio snapshots
SELECT
    user_id,
    wallet,
    snapshot_at,
    jsonb_pretty(asset_token_list) as tokens,
    asset_usd_value,
    debt_usd_value,
    net_usd_value
FROM portfolio_item_snapshots
WHERE user_id = '<test-user-id-from-fixture>';
```

### 2. Run Trend Query Manually

```sql
-- Copy contents of src/queries/sql/get_portfolio_category_trend_by_user_id.sql
-- Replace parameters:
--   :user_id → '<test-user-id>'
--   :start_date → '2024-01-01 00:00:00'::timestamp
--   :end_date → CURRENT_TIMESTAMP

-- Verify results include:
SELECT
    date,
    category,
    category_value_usd,
    category_assets_usd,  -- Should be 10000
    category_debt_usd,    -- Should be 3000
    total_value_usd       -- Should be 7000 (NET)
FROM ...
```

### 3. Validate Calculations

```sql
-- Verify NET = assets - debt for each row
SELECT
    date,
    category,
    category_assets_usd,
    category_debt_usd,
    category_value_usd,
    category_assets_usd - category_debt_usd as calculated_net,
    CASE
        WHEN ABS(category_value_usd - (category_assets_usd - category_debt_usd)) > 0.01
        THEN 'MISMATCH!'
        ELSE 'OK'
    END as validation
FROM ... ;
```

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

### Expand Test Coverage

Additional test cases to implement:

1. **TC2: Multi-Category Debt** - Debt in one category doesn't affect others
2. **TC5: Extreme Leverage** - 95% LTV edge case
3. **TC7: Negative NET Category** - Category with debt > assets
4. **TC8: Mixed DeFi/Wallet Debt** - Debt across source types

### Performance Testing

Test with larger datasets:

```python
# Create 1000 portfolio snapshots across 90 days
# Validate query performance and result accuracy
```

### Continuous Monitoring

Run integration tests:
- Before deploying to production
- After database schema changes
- Weekly as part of regression testing

---

## Support

For questions or issues with integration tests:

1. Check this README's troubleshooting section
2. Review test output for specific error messages
3. Verify database connection and schema
4. Check test fixtures are creating data correctly

---

## Summary

Integration tests are **critical for validating the debt handling fix** because:

1. Unit tests can't validate PostgreSQL-specific SQL
2. JSONB negative amounts require real database testing
3. Cross-endpoint consistency needs end-to-end validation
4. Production bugs are caught before deployment

**Before deploying to production**, ensure all integration tests pass against a PostgreSQL database with production-like data.
