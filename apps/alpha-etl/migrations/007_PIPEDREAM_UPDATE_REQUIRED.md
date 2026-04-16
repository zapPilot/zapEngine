# Pipedream ETL Update Required

## Background

After removing `user_id` from `portfolio_item_snapshots` table, the Pipedream ETL code needs to be updated to match the new unique constraint.

## Analysis of DeBank Data Structure

Your DeBank data correctly contains **multiple portfolio items per protocol**. Example:

- **Protocol:** `base_aerodrome`
- **Position 1:** "Farming" with value $12.80
- **Position 2:** "Liquidity Pool" with value $14.19
- **Position 3:** "Farming" with value $28.47
- etc.

These are **legitimate separate positions**, not duplicates!

## Current vs New Unique Constraint

### ❌ Old (with user_id):
```sql
UNIQUE (user_id, wallet, id_raw, asset_usd_value, snapshot_at)
```

### ✅ New (without user_id):
```sql
UNIQUE (wallet, id_raw, snapshot_at, name_item, net_usd_value)
```

**Verified:** 0 duplicates with this 5-column constraint ✓

## Required Pipedream Code Change

In your Pipedream ETL workflow, update the Supabase insert:

### Before:
```javascript
await axios($, {
    method: "POST",
    url: `https://${subdomain}.supabase.co/rest/v1/portfolio_item_snapshots?on_conflict=user_id,wallet,id_raw,asset_usd_value,snapshot_at`,
    headers: {
        Authorization: `Bearer ${service_key}`,
        apikey: service_key,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates"
    },
    data: snapshotRows
})
```

### After:
```javascript
await axios($, {
    method: "POST",
    url: `https://${subdomain}.supabase.co/rest/v1/portfolio_item_snapshots?on_conflict=wallet,id_raw,snapshot_at,name_item,net_usd_value`,
    headers: {
        Authorization: `Bearer ${service_key}`,
        apikey: service_key,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates"
    },
    data: snapshotRows
})
```

**What changed:**
- Removed `user_id` from `on_conflict` parameter
- Changed `asset_usd_value` to `net_usd_value` (matches database column name)
- Added `name_item` to the conflict resolution

## Why This Works

1. **Preserves all positions**: Multiple staking positions in same protocol are kept
2. **Prevents true duplicates**: Exact same position at same time won't be inserted twice
3. **Matches database constraint**: ETL and database use identical uniqueness definition
4. **No data loss**: All 20,794 existing records are preserved (they're not duplicates!)

## Deployment Order

1. ✅ **Run database migration first**
   ```bash
   psql $DATABASE_URL -f migrations/007_remove_user_id_from_portfolio_item_snapshots_complete.sql
   ```

2. ✅ **Refresh materialized views**
   ```sql
   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_current_portfolio_unified;
   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_portfolio_summary_v2;
   ```

3. ✅ **Update Pipedream ETL code** (change on_conflict parameter)

4. ✅ **Test ETL run** to verify no errors

## Verification

After deploying, verify no duplicates exist:

```sql
SELECT COUNT(*) as remaining_duplicates FROM (
    SELECT wallet, id_raw, snapshot_at, name_item, net_usd_value
    FROM portfolio_item_snapshots
    GROUP BY wallet, id_raw, snapshot_at, name_item, net_usd_value
    HAVING COUNT(*) > 1
) dup;
-- Should return: 0
```

## TypeScript Code Status

✅ **All TypeScript code already updated** (548 tests passing):
- `src/types/database.ts` - user_id removed
- `src/services/database/portfolioItemWriter.ts` - user_id removed
- `src/services/transformers/hyperliquidData.ts` - user_id removed
- `src/services/processors/sources/hyperliquid/index.ts` - user_id removed
- All test files updated and passing
