================================================================================
SQL Parameter Naming Audit
================================================================================
Directory: src/queries/sql
Pattern: :snake_case (lowercase with underscores)
================================================================================

✓ get_pool_performance_by_user.sql
  Parameters: date, jsonb, numeric, text, user_id

✓ get_portfolio_category_trend_by_user_id.sql
  Parameters: date, end_date, numeric, start_date, user_id

✓ get_portfolio_category_trend_from_mv.sql
  Parameters: end_date, start_date, user_id

✓ get_portfolio_daily_returns.sql
  Parameters: date, end_date, start_date, user_id

✓ get_portfolio_drawdown_unified.sql
  Parameters: date, end_date, start_date, user_id

✓ get_portfolio_rolling_metrics.sql
  Parameters: date, numeric, start_date, user_id

✓ get_user_wallets.sql
  Parameters: user_id

✓ get_wallet_token_categories.sql
  Parameters: wallet_address

✓ get_wallet_token_categories_batch.sql
  Parameters: wallet_addresses

✓ portfolio_snapshots_for_yield_returns.sql
  Parameters: end_date, jsonb, start_date, user_id

================================================================================
AUDIT SUMMARY
================================================================================
Total files scanned: 10
Files with violations: 0
Total violations: 0

✅ SUCCESS: All SQL files use consistent :snake_case parameters!
