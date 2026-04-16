-- Minimal schema/bootstrap for integration tests
-- Safe to run multiple times (uses IF NOT EXISTS where possible)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE SCHEMA IF NOT EXISTS alpha_raw;

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE users ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
    END IF;
END$$;

-- daily_wallet_token_snapshots (latest wallet token snapshot per wallet per day)
DROP VIEW IF EXISTS alpha_raw.daily_wallet_token_snapshots;
DROP MATERIALIZED VIEW IF EXISTS alpha_raw.daily_wallet_token_snapshots;
CREATE MATERIALIZED VIEW alpha_raw.daily_wallet_token_snapshots AS
WITH latest_daily AS (
  SELECT
    LOWER(user_wallet_address) AS user_wallet_address,
    inserted_at AS snapshot_date,
    MAX(time_at) AS latest_time_at
  FROM alpha_raw.wallet_token_snapshots
  WHERE is_wallet = TRUE
  GROUP BY LOWER(user_wallet_address), inserted_at
)
SELECT
  wts.id,
  LOWER(wts.user_wallet_address) AS user_wallet_address,
  wts.token_address,
  wts.chain,
  wts.name,
  wts.symbol,
  wts.display_symbol,
  wts.optimized_symbol,
  wts.decimals,
  wts.logo_url,
  wts.protocol_id,
  wts.price,
  wts.price_24h_change,
  wts.is_verified,
  wts.is_core,
  wts.is_wallet,
  wts.time_at,
  wts.inserted_at,
  wts.total_supply,
  wts.credit_score,
  wts.amount,
  wts.raw_amount,
  wts.raw_amount_hex_str,
  wts.inserted_at AS snapshot_date
FROM alpha_raw.wallet_token_snapshots wts
JOIN latest_daily ld
  ON LOWER(wts.user_wallet_address) = ld.user_wallet_address
 AND wts.inserted_at = ld.snapshot_date
 AND wts.time_at = ld.latest_time_at
WHERE wts.is_wallet = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_wallet_token_snapshots_id
  ON alpha_raw.daily_wallet_token_snapshots (id);

CREATE INDEX IF NOT EXISTS idx_daily_wallet_token_snapshots_wallet_date
  ON alpha_raw.daily_wallet_token_snapshots (user_wallet_address, snapshot_date);

CREATE TABLE IF NOT EXISTS plans (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tier INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    plan_code TEXT NOT NULL REFERENCES plans(code),
    starts_at TIMESTAMPTZ DEFAULT NOW(),
    ends_at TIMESTAMPTZ,
    is_canceled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_crypto_wallets (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id TEXT NOT NULL REFERENCES users(id),
    wallet TEXT NOT NULL,
    label TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_crypto_wallets' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE user_crypto_wallets ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_crypto_wallets'
          AND column_name = 'id'
          AND column_default IS NULL
    ) THEN
        ALTER TABLE user_crypto_wallets
            ALTER COLUMN id SET DEFAULT uuid_generate_v4()::text;
    END IF;
END$$;

CREATE TABLE IF NOT EXISTS mv_portfolio_summary_v2 (
    user_id TEXT,
    total_assets REAL,
    total_debt REAL,
    net_portfolio_value REAL,
    wallet_count INTEGER,
    last_updated TIMESTAMPTZ,
    category_summary_assets TEXT,
    category_summary_debt TEXT
);

CREATE TABLE IF NOT EXISTS alpha_raw.wallet_token_snapshots (
    id TEXT DEFAULT uuid_generate_v4()::text,
    user_wallet_address TEXT,
    token_address TEXT,
    amount REAL,
    raw_amount NUMERIC,
    raw_amount_hex_str TEXT,
    price REAL,
    price_24h_change REAL,
    symbol TEXT,
    name TEXT,
    display_symbol TEXT,
    optimized_symbol TEXT,
    decimals INTEGER,
    chain TEXT,
    is_wallet BOOLEAN DEFAULT TRUE,
    logo_url TEXT,
    protocol_id TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    is_core BOOLEAN DEFAULT FALSE,
    time_at BIGINT,
    inserted_at TIMESTAMPTZ,
    total_supply NUMERIC,
    credit_score NUMERIC
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'alpha_raw'
          AND table_name = 'wallet_token_snapshots'
          AND column_name = 'id'
    ) THEN
        ALTER TABLE alpha_raw.wallet_token_snapshots
            ADD COLUMN id TEXT DEFAULT uuid_generate_v4()::text;
    ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'alpha_raw'
          AND table_name = 'wallet_token_snapshots'
          AND column_name = 'id'
          AND column_default IS NULL
    ) THEN
        ALTER TABLE alpha_raw.wallet_token_snapshots
            ALTER COLUMN id SET DEFAULT uuid_generate_v4()::text;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'alpha_raw'
          AND table_name = 'wallet_token_snapshots'
          AND column_name = 'raw_amount'
    ) THEN
        ALTER TABLE alpha_raw.wallet_token_snapshots ADD COLUMN raw_amount NUMERIC;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'alpha_raw'
          AND table_name = 'wallet_token_snapshots'
          AND column_name = 'raw_amount_hex_str'
    ) THEN
        ALTER TABLE alpha_raw.wallet_token_snapshots ADD COLUMN raw_amount_hex_str TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'alpha_raw'
          AND table_name = 'wallet_token_snapshots'
          AND column_name = 'price_24h_change'
    ) THEN
        ALTER TABLE alpha_raw.wallet_token_snapshots ADD COLUMN price_24h_change REAL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'alpha_raw'
          AND table_name = 'wallet_token_snapshots'
          AND column_name = 'name'
    ) THEN
        ALTER TABLE alpha_raw.wallet_token_snapshots ADD COLUMN name TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'alpha_raw'
          AND table_name = 'wallet_token_snapshots'
          AND column_name = 'display_symbol'
    ) THEN
        ALTER TABLE alpha_raw.wallet_token_snapshots ADD COLUMN display_symbol TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'alpha_raw'
          AND table_name = 'wallet_token_snapshots'
          AND column_name = 'optimized_symbol'
    ) THEN
        ALTER TABLE alpha_raw.wallet_token_snapshots ADD COLUMN optimized_symbol TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'alpha_raw'
          AND table_name = 'wallet_token_snapshots'
          AND column_name = 'decimals'
    ) THEN
        ALTER TABLE alpha_raw.wallet_token_snapshots ADD COLUMN decimals INTEGER;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'alpha_raw'
          AND table_name = 'wallet_token_snapshots'
          AND column_name = 'protocol_id'
    ) THEN
        ALTER TABLE alpha_raw.wallet_token_snapshots ADD COLUMN protocol_id TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'alpha_raw'
          AND table_name = 'wallet_token_snapshots'
          AND column_name = 'is_verified'
    ) THEN
        ALTER TABLE alpha_raw.wallet_token_snapshots
            ADD COLUMN is_verified BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'alpha_raw'
          AND table_name = 'wallet_token_snapshots'
          AND column_name = 'is_core'
    ) THEN
        ALTER TABLE alpha_raw.wallet_token_snapshots
            ADD COLUMN is_core BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'alpha_raw'
          AND table_name = 'wallet_token_snapshots'
          AND column_name = 'time_at'
    ) THEN
        ALTER TABLE alpha_raw.wallet_token_snapshots ADD COLUMN time_at BIGINT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'alpha_raw'
          AND table_name = 'wallet_token_snapshots'
          AND column_name = 'total_supply'
    ) THEN
        ALTER TABLE alpha_raw.wallet_token_snapshots ADD COLUMN total_supply NUMERIC;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'alpha_raw'
          AND table_name = 'wallet_token_snapshots'
          AND column_name = 'credit_score'
    ) THEN
        ALTER TABLE alpha_raw.wallet_token_snapshots ADD COLUMN credit_score NUMERIC;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'wallet_token_snapshots_user_wallet_address_token_address_chain_inserted_at_key'
          AND conrelid = 'alpha_raw.wallet_token_snapshots'::regclass
    ) THEN
        ALTER TABLE alpha_raw.wallet_token_snapshots
            DROP CONSTRAINT wallet_token_snapshots_user_wallet_address_token_address_chain_inserted_at_key;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'wallet_token_snapshots_user_wallet_address_token_address_ch_key'
          AND conrelid = 'alpha_raw.wallet_token_snapshots'::regclass
    ) THEN
        ALTER TABLE alpha_raw.wallet_token_snapshots
            DROP CONSTRAINT wallet_token_snapshots_user_wallet_address_token_address_ch_key;
    END IF;
END$$;

CREATE TABLE IF NOT EXISTS portfolio_item_snapshots (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    wallet TEXT NOT NULL,
    snapshot_at TIMESTAMPTZ NOT NULL,
    chain TEXT,
    id_raw TEXT,
    logo_url TEXT,
    site_url TEXT,
    name TEXT,
    name_item TEXT,
    asset_dict JSONB,
    asset_token_list JSONB,
    detail JSONB,
    detail_types TEXT[],
    pool TEXT,
    proxy_detail JSONB,
    asset_usd_value NUMERIC,
    debt_usd_value NUMERIC,
    net_usd_value NUMERIC,
    protocol_type TEXT,
    has_supported_portfolio BOOLEAN,
    pool_symbols TEXT[],
    update_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'portfolio_item_snapshots' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE portfolio_item_snapshots ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'portfolio_item_snapshots' AND column_name = 'id_raw'
    ) THEN
        ALTER TABLE portfolio_item_snapshots ADD COLUMN id_raw TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'portfolio_item_snapshots' AND column_name = 'logo_url'
    ) THEN
        ALTER TABLE portfolio_item_snapshots ADD COLUMN logo_url TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'portfolio_item_snapshots' AND column_name = 'site_url'
    ) THEN
        ALTER TABLE portfolio_item_snapshots ADD COLUMN site_url TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'portfolio_item_snapshots' AND column_name = 'asset_dict'
    ) THEN
        ALTER TABLE portfolio_item_snapshots ADD COLUMN asset_dict JSONB;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'portfolio_item_snapshots' AND column_name = 'detail'
    ) THEN
        ALTER TABLE portfolio_item_snapshots ADD COLUMN detail JSONB;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'portfolio_item_snapshots' AND column_name = 'detail_types'
    ) THEN
        ALTER TABLE portfolio_item_snapshots ADD COLUMN detail_types TEXT[];
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'portfolio_item_snapshots' AND column_name = 'pool'
    ) THEN
        ALTER TABLE portfolio_item_snapshots ADD COLUMN pool TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'portfolio_item_snapshots' AND column_name = 'proxy_detail'
    ) THEN
        ALTER TABLE portfolio_item_snapshots ADD COLUMN proxy_detail JSONB;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'portfolio_item_snapshots' AND column_name = 'update_at'
    ) THEN
        ALTER TABLE portfolio_item_snapshots ADD COLUMN update_at TIMESTAMPTZ;
    END IF;
END$$;

ALTER TABLE IF EXISTS portfolio_item_snapshots
    ADD COLUMN IF NOT EXISTS debt_usd_value NUMERIC;

-- daily_portfolio_snapshots (latest snapshot per wallet per UTC day)
DROP VIEW IF EXISTS public.daily_portfolio_snapshots;
DROP MATERIALIZED VIEW IF EXISTS public.daily_portfolio_snapshots;
CREATE MATERIALIZED VIEW public.daily_portfolio_snapshots AS
WITH latest_daily AS (
  SELECT
    LOWER(wallet) AS wallet,
    DATE(snapshot_at AT TIME ZONE 'UTC') AS snapshot_date,
    MAX(snapshot_at) AS latest_snapshot_at
  FROM public.portfolio_item_snapshots
  GROUP BY LOWER(wallet), DATE(snapshot_at AT TIME ZONE 'UTC')
)
SELECT
  pis.id,
  LOWER(pis.wallet) AS wallet,
  pis.snapshot_at,
  DATE(pis.snapshot_at AT TIME ZONE 'UTC') AS snapshot_date,
  pis.chain,
  pis.has_supported_portfolio,
  pis.id_raw,
  pis.logo_url,
  pis.name,
  pis.site_url,
  pis.asset_dict,
  pis.asset_token_list,
  pis.detail,
  pis.detail_types,
  pis.pool,
  pis.proxy_detail,
  pis.asset_usd_value,
  pis.debt_usd_value,
  pis.net_usd_value,
  pis.update_at,
  pis.name_item
FROM public.portfolio_item_snapshots pis
JOIN latest_daily ld
  ON LOWER(pis.wallet) = ld.wallet
 AND DATE(pis.snapshot_at AT TIME ZONE 'UTC') = ld.snapshot_date
 AND pis.snapshot_at = ld.latest_snapshot_at;

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_portfolio_snapshots_id
  ON public.daily_portfolio_snapshots (id);

CREATE INDEX IF NOT EXISTS idx_daily_portfolio_snapshots_wallet_date
  ON public.daily_portfolio_snapshots (wallet, snapshot_date);

-- Required function for classification tests
CREATE OR REPLACE FUNCTION classify_token_category(symbol TEXT)
RETURNS TEXT AS $$
BEGIN
    IF symbol IS NULL THEN
        RETURN 'others';
    END IF;

    CASE LOWER(symbol)
        WHEN 'btc', 'wbtc', 'tbtc', 'renbtc' THEN RETURN 'btc';
        WHEN 'eth', 'weth', 'steth', 'reth' THEN RETURN 'eth';
        WHEN 'usdc', 'usdt', 'dai', 'busd', 'tusd', 'usdp', 'frax' THEN RETURN 'stablecoins';
        ELSE RETURN 'others';
    END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Materialized view for category trend data (tests expect it to return rows)
DROP VIEW IF EXISTS portfolio_category_trend_mv;
DROP MATERIALIZED VIEW IF EXISTS portfolio_category_trend_mv;
CREATE MATERIALIZED VIEW portfolio_category_trend_mv AS
WITH user_wallets AS (
    SELECT
        user_id,
        LOWER(wallet) AS wallet
    FROM user_crypto_wallets
),
portfolio_snapshots AS (
    SELECT
        uw.user_id,
        dps.wallet,
        dps.snapshot_at,
        dps.asset_token_list
    FROM daily_portfolio_snapshots dps
    JOIN user_wallets uw ON dps.wallet = uw.wallet
),
defi_tokens AS (
    SELECT
        ps.user_id,
        (ps.snapshot_at AT TIME ZONE 'UTC')::date AS bucket_date,
        'defi' AS source_type,
        classify_token_category(token->>'symbol') AS category,
        (COALESCE((token->>'amount')::numeric, 0) * COALESCE((token->>'price')::numeric, 0)) AS token_value
    FROM portfolio_snapshots ps
    CROSS JOIN LATERAL jsonb_array_elements(ps.asset_token_list) AS token
    WHERE ps.asset_token_list IS NOT NULL
      AND jsonb_array_length(ps.asset_token_list) > 0
),
wallet_tokens AS (
    SELECT
        uw.user_id,
        DATE_TRUNC('day', dwt.inserted_at)::date AS bucket_date,
        'wallet' AS source_type,
        classify_token_category(dwt.symbol) AS category,
        (COALESCE(dwt.amount, 0) * COALESCE(dwt.price, 0)) AS token_value
    FROM alpha_raw.daily_wallet_token_snapshots dwt
    JOIN user_wallets uw ON dwt.user_wallet_address = uw.wallet
    WHERE dwt.is_wallet = TRUE
),
all_tokens AS (
    SELECT * FROM defi_tokens WHERE token_value <> 0
    UNION ALL
    SELECT * FROM wallet_tokens WHERE token_value <> 0
),
daily_aggregation AS (
    SELECT
        user_id,
        bucket_date,
        source_type,
        category,
        SUM(CASE WHEN token_value > 0 THEN token_value ELSE 0 END) AS category_assets_usd,
        SUM(CASE WHEN token_value < 0 THEN ABS(token_value) ELSE 0 END) AS category_debt_usd,
        SUM(token_value) AS category_value_usd
    FROM all_tokens
    GROUP BY user_id, bucket_date, source_type, category
),
daily_totals AS (
    SELECT
        user_id,
        bucket_date,
        SUM(category_value_usd) AS total_value_usd
    FROM daily_aggregation
    GROUP BY user_id, bucket_date
),
with_window_metrics AS (
    SELECT
        da.user_id,
        da.bucket_date,
        da.source_type,
        da.category,
        da.category_value_usd,
        da.category_assets_usd,
        da.category_debt_usd,
        LAG(da.category_value_usd) OVER (
            PARTITION BY da.user_id, da.source_type, da.category
            ORDER BY da.bucket_date
        ) AS prev_value_usd,
        dt.total_value_usd
    FROM daily_aggregation da
    JOIN daily_totals dt
      ON da.user_id = dt.user_id AND da.bucket_date = dt.bucket_date
)
SELECT
    user_id,
    bucket_date AS date,
    source_type,
    category,
    category_value_usd,
    category_assets_usd,
    category_debt_usd,
    COALESCE(category_value_usd - prev_value_usd, 0) AS pnl_usd,
    total_value_usd
FROM with_window_metrics
ORDER BY user_id, date ASC, category ASC, source_type ASC;

CREATE UNIQUE INDEX IF NOT EXISTS portfolio_category_trend_mv_uniq
    ON portfolio_category_trend_mv (user_id, date, category, source_type);

CREATE INDEX IF NOT EXISTS idx_portfolio_category_trend_user_date
    ON portfolio_category_trend_mv (user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_portfolio_category_trend_user_category
    ON portfolio_category_trend_mv (user_id, category);

CREATE INDEX IF NOT EXISTS idx_portfolio_category_trend_user_source
    ON portfolio_category_trend_mv (user_id, source_type);

-- Minimal alpha_raw tables used by queries (empty but present)
CREATE TABLE IF NOT EXISTS alpha_raw.pool_apr_snapshots (
    pool_address TEXT,
    pool_id TEXT,
    protocol TEXT,
    chain TEXT,
    symbol TEXT,
    apr NUMERIC,
    apr_base NUMERIC,
    apr_reward NUMERIC,
    snapshot_time TIMESTAMPTZ,
    source TEXT,
    inserted_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS alpha_raw.pool_apr_snapshots
    ADD COLUMN IF NOT EXISTS pool_address TEXT,
    ADD COLUMN IF NOT EXISTS pool_id TEXT,
    ADD COLUMN IF NOT EXISTS protocol TEXT,
    ADD COLUMN IF NOT EXISTS chain TEXT,
    ADD COLUMN IF NOT EXISTS symbol TEXT,
    ADD COLUMN IF NOT EXISTS apr NUMERIC,
    ADD COLUMN IF NOT EXISTS apr_base NUMERIC,
    ADD COLUMN IF NOT EXISTS apr_reward NUMERIC,
    ADD COLUMN IF NOT EXISTS snapshot_time TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS source TEXT,
    ADD COLUMN IF NOT EXISTS inserted_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS alpha_raw.hyperliquid_vault_apr_snapshots (
    vault_address TEXT,
    leader_address TEXT DEFAULT '',
    vault_name TEXT DEFAULT '',
    protocol TEXT,
    apr NUMERIC DEFAULT 0,
    apr_base NUMERIC,
    apr_reward NUMERIC,
    snapshot_time TIMESTAMPTZ DEFAULT NOW(),
    source TEXT,
    inserted_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS alpha_raw.hyperliquid_vault_apr_snapshots
    ADD COLUMN IF NOT EXISTS vault_address TEXT,
    ADD COLUMN IF NOT EXISTS leader_address TEXT,
    ADD COLUMN IF NOT EXISTS vault_name TEXT,
    ADD COLUMN IF NOT EXISTS protocol TEXT,
    ADD COLUMN IF NOT EXISTS apr NUMERIC,
    ADD COLUMN IF NOT EXISTS apr_base NUMERIC,
    ADD COLUMN IF NOT EXISTS apr_reward NUMERIC,
    ADD COLUMN IF NOT EXISTS snapshot_time TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS source TEXT,
    ADD COLUMN IF NOT EXISTS inserted_at TIMESTAMPTZ DEFAULT NOW();

-- Refresh placeholder MV after creation
REFRESH MATERIALIZED VIEW portfolio_category_trend_mv;
