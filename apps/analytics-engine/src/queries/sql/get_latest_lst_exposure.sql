-- Latest direct token exposure for ETH staking-income attribution.
--
-- Reads only the canonical daily tables:
--   * analytics.daily_wallet_tokens for idle wallet balances
--   * analytics.daily_portfolio_positions supply/collateral token lists
--
-- Borrow lists, reward lists, asset_token_list, LP underlyings, and receipt-token
-- representations are deliberately excluded. Eligibility is decided later by the
-- explicit chain + token-address registry, never by token symbol.
--
-- Addresses are compared raw on the analytics side and folded only on the
-- user_crypto_wallets side: alpha-etl lower-cases every address it writes
-- (portfolioWriter.ts, balanceWriter.ts), while registration keeps the casing the
-- user typed. Wrapping the stored column in LOWER() made the equality unusable as
-- an index prefix, so both tables were read end to end.

WITH user_wallets AS (
    SELECT DISTINCT LOWER(wallet) AS wallet
    FROM user_crypto_wallets
    WHERE user_id = :user_id
      AND (
        CAST(:wallet_address AS TEXT) IS NULL
        OR LOWER(wallet) = LOWER(CAST(:wallet_address AS TEXT))
      )
),
latest_idle_day AS (
    -- Equality on the primary key's leading column, so this side reads only the
    -- wallet's own index entries. Fetching the day's rows below still can't use
    -- that key -- see the index note at the end of this file.
    SELECT t.user_wallet_address AS wallet, MAX(t.snapshot_date) AS snapshot_date
    FROM analytics.daily_wallet_tokens t
    JOIN user_wallets uw ON t.user_wallet_address = uw.wallet
    GROUP BY t.user_wallet_address
),
idle_tokens AS (
    SELECT
        t.chain,
        t.token_address,
        t.symbol,
        t.amount,
        t.price,
        'idle'::text AS exposure_type,
        'idle'::text AS source_kind,
        t.user_wallet_address AS source_id,
        NULL::text AS position_type
    FROM analytics.daily_wallet_tokens t
    JOIN latest_idle_day latest
      ON t.user_wallet_address = latest.wallet
     AND t.snapshot_date = latest.snapshot_date
),
latest_position_day AS (
    -- (wallet, snapshot_date, source) is ordered by snapshot_date once wallet is
    -- fixed, so the newest DeBank day is a single backwards probe per wallet.
    SELECT uw.wallet, latest.snapshot_date
    FROM user_wallets uw
    CROSS JOIN LATERAL (
        SELECT p.snapshot_date
        FROM analytics.daily_portfolio_positions p
        WHERE p.wallet = uw.wallet
          AND p.source = 'debank'
        ORDER BY p.snapshot_date DESC
        LIMIT 1
    ) latest
),
supplied_tokens AS (
    SELECT
        p.chain,
        COALESCE(token->>'id', token->>'token_address', token->>'address') AS token_address,
        COALESCE(token->>'optimized_symbol', token->>'symbol') AS symbol,
        NULLIF(token->>'amount', '')::double precision AS amount,
        NULLIF(token->>'price', '')::double precision AS price,
        'supply'::text AS exposure_type,
        'position'::text AS source_kind,
        p.id::text AS source_id,
        p.name_item AS position_type
    FROM analytics.daily_portfolio_positions p
    JOIN latest_position_day latest
      ON p.wallet = latest.wallet
     AND p.snapshot_date = latest.snapshot_date
    CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(p.detail->'supply_token_list', '[]'::jsonb)
    ) AS supplied(token)
    WHERE p.source = 'debank'
)
SELECT
    chain,
    token_address,
    symbol,
    amount,
    price,
    exposure_type,
    source_kind,
    source_id,
    position_type
FROM idle_tokens
UNION ALL
SELECT
    chain,
    token_address,
    symbol,
    amount,
    price,
    exposure_type,
    source_kind,
    source_id,
    position_type
FROM supplied_tokens;

-- Missing index (needs a root supabase/migrations/ file and an operator db push):
--   analytics.daily_wallet_tokens (user_wallet_address, snapshot_date)
-- The primary key cannot stand in for it: snapshot_date is its fourth column,
-- behind token_address and chain, so pulling one day's tokens for a wallet is not
-- an index probe and the planner falls back to reading the whole table. Adding the
-- index turned idle_tokens from a full scan into three probes when this was
-- measured. The positions half above needs nothing new -- it already has
-- (wallet, snapshot_date, source).
