-- Latest direct token exposure for ETH staking-income attribution.
--
-- Reads only the canonical daily tables:
--   * analytics.daily_wallet_tokens for idle wallet balances
--   * analytics.daily_portfolio_positions supply/collateral token lists
--
-- Borrow lists, reward lists, asset_token_list, LP underlyings, and receipt-token
-- representations are deliberately excluded. Eligibility is decided later by the
-- explicit chain + token-address registry, never by token symbol.

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
    SELECT LOWER(t.user_wallet_address) AS wallet, MAX(t.snapshot_date) AS snapshot_date
    FROM analytics.daily_wallet_tokens t
    JOIN user_wallets uw ON LOWER(t.user_wallet_address) = uw.wallet
    GROUP BY LOWER(t.user_wallet_address)
),
idle_tokens AS (
    SELECT
        t.chain,
        t.token_address,
        t.symbol,
        t.amount,
        t.price,
        'idle'::text AS source_kind,
        LOWER(t.user_wallet_address) AS source_id
    FROM analytics.daily_wallet_tokens t
    JOIN latest_idle_day latest
      ON LOWER(t.user_wallet_address) = latest.wallet
     AND t.snapshot_date = latest.snapshot_date
),
latest_position_day AS (
    SELECT LOWER(p.wallet) AS wallet, MAX(p.snapshot_date) AS snapshot_date
    FROM analytics.daily_portfolio_positions p
    JOIN user_wallets uw ON LOWER(p.wallet) = uw.wallet
    GROUP BY LOWER(p.wallet)
),
supplied_tokens AS (
    SELECT
        p.chain,
        COALESCE(token->>'id', token->>'token_address', token->>'address') AS token_address,
        COALESCE(token->>'optimized_symbol', token->>'symbol') AS symbol,
        NULLIF(token->>'amount', '')::double precision AS amount,
        NULLIF(token->>'price', '')::double precision AS price,
        'position'::text AS source_kind,
        p.id::text AS source_id
    FROM analytics.daily_portfolio_positions p
    JOIN latest_position_day latest
      ON LOWER(p.wallet) = latest.wallet
     AND p.snapshot_date = latest.snapshot_date
    CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(p.detail->'supply_token_list', '[]'::jsonb)
    ) AS supplied(token)
)
SELECT chain, token_address, symbol, amount, price, source_kind, source_id
FROM idle_tokens
UNION ALL
SELECT chain, token_address, symbol, amount, price, source_kind, source_id
FROM supplied_tokens;
