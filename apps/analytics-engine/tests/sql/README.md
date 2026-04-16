# SQL Integration Tests

Comprehensive SQL-level tests for validating the query fixes applied to:
1. `get_portfolio_daily_returns.sql` - JOIN with user_crypto_wallets + division-by-zero protection
2. `get_portfolio_drawdown_unified.sql` - JOIN with user_crypto_wallets + drawdown calculations

## Quick Start

```bash
# Setup test data
psql $DATABASE_URL -f tests/sql/fixtures/setup_test_data.sql

# Run validation tests
psql $DATABASE_URL -f tests/sql/test_query_fixes_validation.sql

# Cleanup
psql $DATABASE_URL -f tests/sql/fixtures/teardown_test_data.sql
```

## Test Data Overview

### User A (Volatile Portfolio)
- **User ID**: `a0000000-0000-0000-0000-000000000001`
- **Wallets**: 2 wallets (ethereum)
- **Duration**: 30 days
- **Pattern**: Volatile with oscillating returns and growth trend
- **Purpose**: Test multi-wallet aggregation, drawdown cycles, recovery

### User B (Stable Portfolio)
- **User ID**: `b0000000-0000-0000-0000-000000000002`
- **Wallets**: 2 wallets (polygon)
- **Duration**: 10 days
- **Pattern**: Steady linear growth
- **Purpose**: Test stable returns, minimal drawdown

### User C (Edge Cases)
- **User ID**: `c0000000-0000-0000-0000-000000000003`
- **Wallets**: 1 wallet (ethereum)
- **Duration**: Sparse (days 0, 3, 5, 7, 10)
- **Pattern**: Zero values, gaps, negative values, overflow values
- **Purpose**: Test division-by-zero, gap handling, extreme values

### Shared Wallet (Isolation Test)
- **Wallet**: `0xshared111111111111111111111111111111111`
- **Linked to**: User A only
- **Value**: 99999 (easily identifiable)
- **Purpose**: Verify User B and C don't see this wallet's data

## Test Coverage

### Test 1: Daily Returns - Multi-Wallet Aggregation
- **Query**: `get_portfolio_daily_returns.sql`
- **User**: User A (30 days, 2 wallets)
- **Validates**:
  - JOIN correctly aggregates across wallets
  - 29 returns from 30 days (first day has no LAG)
  - SUM of wallet values is correct

### Test 2: Daily Returns - Division-by-Zero Protection
- **Query**: `get_portfolio_daily_returns.sql`
- **User**: User C (edge cases with zero values)
- **Validates**:
  - NULLIF prevents division-by-zero errors
  - CASE statement filters NULL returns
  - Query completes without PostgreSQL error

### Test 3: User Isolation - Shared Wallet
- **Query**: Both queries
- **Users**: User B should NOT see User A's shared wallet
- **Validates**:
  - JOIN with user_crypto_wallets enforces user isolation
  - User B's max portfolio value < 10000 (no 99999 leak)

### Test 4: Drawdown - Running Peak Calculation
- **Query**: `get_portfolio_drawdown_unified.sql`
- **User**: User A
- **Validates**:
  - Running MAX window function works correctly
  - Peak values never decrease
  - Peak = MAX(all previous portfolio values)

### Test 5: Drawdown - Underwater Flag
- **Query**: `get_portfolio_drawdown_unified.sql`
- **User**: User A
- **Validates**:
  - is_underwater = true when portfolio_value < peak_value
  - is_underwater = false when at peak
  - Percentage of underwater days calculated

### Test 6: Drawdown - Recovery Point Detection
- **Query**: `get_portfolio_drawdown_unified.sql`
- **User**: User A
- **Validates**:
  - recovery_point = true when transitioning from underwater to peak
  - Uses LAG to detect previous_underwater state
  - Multiple recovery cycles detected in volatile data

### Test 7: Performance Benchmark
- **Query**: `get_portfolio_daily_returns.sql`
- **User**: User A (30 days of data)
- **Validates**:
  - Query completes in reasonable time (< 500ms expected)
  - EXPLAIN ANALYZE shows efficient execution plan
  - Index usage on JOIN and WHERE clauses

## Expected Results

All tests should output **PASS** status. Example:

```
TEST 1: Daily Returns - Multi-Wallet Aggregation (User A)
 row_count | earliest_date | latest_date | avg_portfolio_value | volatility |    test_result
-----------+---------------+-------------+---------------------+------------+-------------------
        29 | 2025-01-12    | 2025-02-10  |             1650.50 |   0.024    | PASS

TEST 2: Daily Returns - Division-by-Zero Protection (User C)
                    test_result                     | valid_returns | zero_value_days
----------------------------------------------------+---------------+-----------------
 PASS: Query executed without division-by-zero error|             2 |               0

TEST 3: User Isolation - Shared Wallet (User B vs User A)
                 test_result                  | max_value
----------------------------------------------+-----------
 PASS: User B isolated (no shared wallet data)|   3180.00
```

## Troubleshooting

### Test Failures

**"Expected 29 rows, got N"**
- Check if test data was created correctly
- Verify DATE aggregation works (GROUP BY DATE(snapshot_at))
- Ensure wallets are linked in user_crypto_wallets

**"User B seeing shared wallet value=99999"**
- JOIN condition is broken
- Check: `INNER JOIN user_crypto_wallets ucw ON pis.wallet = ucw.wallet`
- Verify WHERE clause uses `ucw.user_id`

**"Peak decreased"**
- Running MAX window function logic error
- Verify: `MAX(...) OVER (ORDER BY date ROWS UNBOUNDED PRECEDING)`

**"Division-by-zero error"**
- NULLIF protection not working
- Check CASE statement logic
- Verify: `/ NULLIF(previous_value, 0)`

### Performance Issues

If queries take > 1 second:
1. Check indexes on `portfolio_item_snapshots`:
   - `wallet` (for JOIN)
   - `snapshot_at` (for date filtering)
2. Check index on `user_crypto_wallets.wallet`
3. Run `VACUUM ANALYZE` on both tables
4. Review EXPLAIN ANALYZE output for sequential scans

## File Structure

```
tests/sql/
├── fixtures/
│   ├── setup_test_data.sql       # Create test users, wallets, snapshots
│   └── teardown_test_data.sql    # Delete test data
├── test_query_fixes_validation.sql  # Run all 7 validation tests
└── README.md                      # This file
```

## Integration with Python Tests

The SQL tests complement the Python pytest suite in:
- `tests/queries/test_get_portfolio_daily_returns_sql.py`
- `tests/queries/test_get_portfolio_drawdown_unified_sql.py`

Python tests use SQLAlchemy ORM and fixtures, SQL tests use raw PostgreSQL.
Both should pass for complete validation.
