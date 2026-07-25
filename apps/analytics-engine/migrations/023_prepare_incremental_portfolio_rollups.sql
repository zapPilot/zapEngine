-- ============================================================================
-- Migration 023: Prepare incremental portfolio rollups
-- ============================================================================
-- Creates private cache/queue storage and the only function allowed to mutate
-- the caches. Source-table triggers enqueue the smallest affected key. The
-- public compatibility relations are activated in migration 024.
--
-- IMPORTANT: DeBank id_raw is protocol-level, not position-level. The
-- portfolio cache keeps every row from the latest protocol batch.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE TABLE IF NOT EXISTS private.daily_portfolio_snapshots_cache AS
SELECT *
FROM public.daily_portfolio_snapshots
WITH NO DATA;

CREATE TABLE IF NOT EXISTS private.daily_wallet_token_snapshots_cache AS
SELECT *
FROM alpha_raw.daily_wallet_token_snapshots
WITH NO DATA;

CREATE TABLE IF NOT EXISTS private.portfolio_category_trend_cache AS
SELECT *
FROM public.portfolio_category_trend_mv
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS daily_portfolio_snapshots_cache_id_idx
  ON private.daily_portfolio_snapshots_cache (id);
CREATE INDEX IF NOT EXISTS daily_portfolio_snapshots_cache_wallet_date_idx
  ON private.daily_portfolio_snapshots_cache (wallet, snapshot_date);

CREATE UNIQUE INDEX IF NOT EXISTS daily_wallet_token_snapshots_cache_id_idx
  ON private.daily_wallet_token_snapshots_cache (id);
CREATE INDEX IF NOT EXISTS daily_wallet_token_snapshots_cache_wallet_date_idx
  ON private.daily_wallet_token_snapshots_cache (
    user_wallet_address,
    snapshot_date
  );

CREATE UNIQUE INDEX IF NOT EXISTS portfolio_category_trend_cache_uniq_idx
  ON private.portfolio_category_trend_cache (
    user_id,
    date,
    category,
    source_type
  );
CREATE INDEX IF NOT EXISTS portfolio_category_trend_cache_user_date_idx
  ON private.portfolio_category_trend_cache (user_id, date DESC);
CREATE INDEX IF NOT EXISTS portfolio_category_trend_cache_user_category_idx
  ON private.portfolio_category_trend_cache (user_id, category);
CREATE INDEX IF NOT EXISTS portfolio_category_trend_cache_user_source_idx
  ON private.portfolio_category_trend_cache (user_id, source_type);

ALTER TABLE private.daily_portfolio_snapshots_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.daily_wallet_token_snapshots_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.portfolio_category_trend_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_portfolio_snapshots_cache_select
  ON private.daily_portfolio_snapshots_cache;
CREATE POLICY daily_portfolio_snapshots_cache_select
  ON private.daily_portfolio_snapshots_cache
  FOR SELECT
  TO PUBLIC
  USING (true);

DROP POLICY IF EXISTS daily_wallet_token_snapshots_cache_select
  ON private.daily_wallet_token_snapshots_cache;
CREATE POLICY daily_wallet_token_snapshots_cache_select
  ON private.daily_wallet_token_snapshots_cache
  FOR SELECT
  TO PUBLIC
  USING (true);

DROP POLICY IF EXISTS portfolio_category_trend_cache_select
  ON private.portfolio_category_trend_cache;
CREATE POLICY portfolio_category_trend_cache_select
  ON private.portfolio_category_trend_cache
  FOR SELECT
  TO PUBLIC
  USING (true);

CREATE TABLE IF NOT EXISTS private.portfolio_rollup_dirty_portfolio (
  wallet text NOT NULL,
  protocol text NOT NULL,
  snapshot_date date NOT NULL,
  enqueued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (wallet, protocol, snapshot_date)
);

CREATE TABLE IF NOT EXISTS private.portfolio_rollup_dirty_wallet (
  wallet text NOT NULL,
  snapshot_date date NOT NULL,
  enqueued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (wallet, snapshot_date)
);

-- Derive the user_id type from the deployed schema. Production uses uuid while
-- the isolated integration database intentionally uses text IDs.
CREATE TABLE IF NOT EXISTS private.portfolio_rollup_dirty_users AS
SELECT
  user_id,
  clock_timestamp() AS enqueued_at
FROM public.user_crypto_wallets
WITH NO DATA;

ALTER TABLE private.portfolio_rollup_dirty_users
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN enqueued_at SET NOT NULL,
  ALTER COLUMN enqueued_at SET DEFAULT clock_timestamp();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'private.portfolio_rollup_dirty_users'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE private.portfolio_rollup_dirty_users
      ADD PRIMARY KEY (user_id);
  END IF;
END
$$;

ALTER TABLE private.portfolio_rollup_dirty_portfolio ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.portfolio_rollup_dirty_wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.portfolio_rollup_dirty_users ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.daily_portfolio_snapshots_cache FROM PUBLIC;
REVOKE ALL ON TABLE private.daily_wallet_token_snapshots_cache FROM PUBLIC;
REVOKE ALL ON TABLE private.portfolio_category_trend_cache FROM PUBLIC;
REVOKE ALL ON TABLE private.portfolio_rollup_dirty_portfolio FROM PUBLIC;
REVOKE ALL ON TABLE private.portfolio_rollup_dirty_wallet FROM PUBLIC;
REVOKE ALL ON TABLE private.portfolio_rollup_dirty_users FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.enqueue_portfolio_snapshot_rollup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE')
     AND NEW.wallet IS NOT NULL
     AND NEW.name IS NOT NULL
     AND NEW.snapshot_at IS NOT NULL THEN
    INSERT INTO private.portfolio_rollup_dirty_portfolio (
      wallet,
      protocol,
      snapshot_date
    )
    VALUES (
      pg_catalog.lower(NEW.wallet),
      NEW.name,
      (NEW.snapshot_at AT TIME ZONE 'UTC')::date
    )
    ON CONFLICT (wallet, protocol, snapshot_date)
    DO UPDATE SET enqueued_at = LEAST(
      private.portfolio_rollup_dirty_portfolio.enqueued_at,
      EXCLUDED.enqueued_at
    );
  END IF;

  IF TG_OP IN ('DELETE', 'UPDATE')
     AND OLD.wallet IS NOT NULL
     AND OLD.name IS NOT NULL
     AND OLD.snapshot_at IS NOT NULL THEN
    INSERT INTO private.portfolio_rollup_dirty_portfolio (
      wallet,
      protocol,
      snapshot_date
    )
    VALUES (
      pg_catalog.lower(OLD.wallet),
      OLD.name,
      (OLD.snapshot_at AT TIME ZONE 'UTC')::date
    )
    ON CONFLICT (wallet, protocol, snapshot_date)
    DO UPDATE SET enqueued_at = LEAST(
      private.portfolio_rollup_dirty_portfolio.enqueued_at,
      EXCLUDED.enqueued_at
    );
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION private.enqueue_wallet_token_snapshot_rollup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE')
     AND NEW.is_wallet IS TRUE
     AND NEW.user_wallet_address IS NOT NULL
     AND NEW.inserted_at IS NOT NULL THEN
    INSERT INTO private.portfolio_rollup_dirty_wallet (
      wallet,
      snapshot_date
    )
    VALUES (
      pg_catalog.lower(NEW.user_wallet_address),
      NEW.inserted_at::date
    )
    ON CONFLICT (wallet, snapshot_date)
    DO UPDATE SET enqueued_at = LEAST(
      private.portfolio_rollup_dirty_wallet.enqueued_at,
      EXCLUDED.enqueued_at
    );
  END IF;

  IF TG_OP IN ('DELETE', 'UPDATE')
     AND OLD.is_wallet IS TRUE
     AND OLD.user_wallet_address IS NOT NULL
     AND OLD.inserted_at IS NOT NULL THEN
    INSERT INTO private.portfolio_rollup_dirty_wallet (
      wallet,
      snapshot_date
    )
    VALUES (
      pg_catalog.lower(OLD.user_wallet_address),
      OLD.inserted_at::date
    )
    ON CONFLICT (wallet, snapshot_date)
    DO UPDATE SET enqueued_at = LEAST(
      private.portfolio_rollup_dirty_wallet.enqueued_at,
      EXCLUDED.enqueued_at
    );
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION private.enqueue_user_wallet_rollup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.user_id IS NOT NULL THEN
    INSERT INTO private.portfolio_rollup_dirty_users (user_id)
    VALUES (NEW.user_id)
    ON CONFLICT (user_id)
    DO UPDATE SET enqueued_at = LEAST(
      private.portfolio_rollup_dirty_users.enqueued_at,
      EXCLUDED.enqueued_at
    );
  END IF;

  IF TG_OP IN ('DELETE', 'UPDATE') AND OLD.user_id IS NOT NULL THEN
    INSERT INTO private.portfolio_rollup_dirty_users (user_id)
    VALUES (OLD.user_id)
    ON CONFLICT (user_id)
    DO UPDATE SET enqueued_at = LEAST(
      private.portfolio_rollup_dirty_users.enqueued_at,
      EXCLUDED.enqueued_at
    );
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION private.enqueue_portfolio_snapshot_rollup() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.enqueue_wallet_token_snapshot_rollup() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.enqueue_user_wallet_rollup() FROM PUBLIC;

DROP TRIGGER IF EXISTS enqueue_portfolio_snapshot_rollup
  ON public.portfolio_item_snapshots;
CREATE TRIGGER enqueue_portfolio_snapshot_rollup
AFTER INSERT OR UPDATE OR DELETE
ON public.portfolio_item_snapshots
FOR EACH ROW
EXECUTE FUNCTION private.enqueue_portfolio_snapshot_rollup();

DROP TRIGGER IF EXISTS enqueue_wallet_token_snapshot_rollup
  ON alpha_raw.wallet_token_snapshots;
CREATE TRIGGER enqueue_wallet_token_snapshot_rollup
AFTER INSERT OR UPDATE OR DELETE
ON alpha_raw.wallet_token_snapshots
FOR EACH ROW
EXECUTE FUNCTION private.enqueue_wallet_token_snapshot_rollup();

DROP TRIGGER IF EXISTS enqueue_user_wallet_rollup
  ON public.user_crypto_wallets;
CREATE TRIGGER enqueue_user_wallet_rollup
AFTER INSERT OR UPDATE OR DELETE
ON public.user_crypto_wallets
FOR EACH ROW
EXECUTE FUNCTION private.enqueue_user_wallet_rollup();

CREATE OR REPLACE FUNCTION private.process_portfolio_rollup_queue(
  p_max_keys integer DEFAULT 5000
)
RETURNS TABLE (
  portfolio_keys_processed bigint,
  wallet_keys_processed bigint,
  users_processed bigint,
  portfolio_rows_written bigint,
  wallet_rows_written bigint,
  trend_rows_written bigint,
  remaining_portfolio_keys bigint,
  remaining_wallet_keys bigint,
  remaining_users bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_portfolio_keys jsonb := '[]'::jsonb;
  v_wallet_keys jsonb := '[]'::jsonb;
  v_dirty_users jsonb := '[]'::jsonb;
  v_affected_users jsonb := '[]'::jsonb;
BEGIN
  IF p_max_keys IS NULL OR p_max_keys < 1 THEN
    RAISE EXCEPTION 'p_max_keys must be a positive integer';
  END IF;

  -- Cron and ETL use the same writer. The transaction-scoped lock makes a
  -- second caller wait, then observe an already-drained queue.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'private.process_portfolio_rollup_queue',
      0
    )
  );

  WITH picked AS MATERIALIZED (
    SELECT q.wallet, q.protocol, q.snapshot_date
    FROM private.portfolio_rollup_dirty_portfolio AS q
    ORDER BY q.enqueued_at, q.wallet, q.protocol, q.snapshot_date
    LIMIT p_max_keys
    FOR UPDATE SKIP LOCKED
  ),
  deleted AS (
    DELETE FROM private.portfolio_rollup_dirty_portfolio AS q
    USING picked AS p
    WHERE q.wallet = p.wallet
      AND q.protocol = p.protocol
      AND q.snapshot_date = p.snapshot_date
    RETURNING q.wallet, q.protocol, q.snapshot_date
  )
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'wallet', d.wallet,
        'protocol', d.protocol,
        'snapshot_date', d.snapshot_date
      )
    ),
    '[]'::jsonb
  )
  INTO v_portfolio_keys
  FROM deleted AS d;

  WITH picked AS MATERIALIZED (
    SELECT q.wallet, q.snapshot_date
    FROM private.portfolio_rollup_dirty_wallet AS q
    ORDER BY q.enqueued_at, q.wallet, q.snapshot_date
    LIMIT p_max_keys
    FOR UPDATE SKIP LOCKED
  ),
  deleted AS (
    DELETE FROM private.portfolio_rollup_dirty_wallet AS q
    USING picked AS p
    WHERE q.wallet = p.wallet
      AND q.snapshot_date = p.snapshot_date
    RETURNING q.wallet, q.snapshot_date
  )
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'wallet', d.wallet,
        'snapshot_date', d.snapshot_date
      )
    ),
    '[]'::jsonb
  )
  INTO v_wallet_keys
  FROM deleted AS d;

  WITH picked AS MATERIALIZED (
    SELECT q.user_id
    FROM private.portfolio_rollup_dirty_users AS q
    ORDER BY q.enqueued_at, q.user_id
    LIMIT p_max_keys
    FOR UPDATE SKIP LOCKED
  ),
  deleted AS (
    DELETE FROM private.portfolio_rollup_dirty_users AS q
    USING picked AS p
    WHERE q.user_id = p.user_id
    RETURNING q.user_id
  )
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('user_id', d.user_id::text)
    ),
    '[]'::jsonb
  )
  INTO v_dirty_users
  FROM deleted AS d;

  portfolio_keys_processed :=
    pg_catalog.jsonb_array_length(v_portfolio_keys);
  wallet_keys_processed := pg_catalog.jsonb_array_length(v_wallet_keys);

  DELETE FROM private.daily_portfolio_snapshots_cache AS cache
  USING pg_catalog.jsonb_to_recordset(v_portfolio_keys)
    AS dirty(wallet text, protocol text, snapshot_date date)
  WHERE cache.wallet = dirty.wallet
    AND cache.name = dirty.protocol
    AND cache.snapshot_date = dirty.snapshot_date;

  WITH dirty AS (
    SELECT *
    FROM pg_catalog.jsonb_to_recordset(v_portfolio_keys)
      AS keys(wallet text, protocol text, snapshot_date date)
  ),
  latest_protocol_batch AS (
    SELECT
      pis.wallet_lower,
      pis.name,
      pis.snapshot_date_utc,
      pg_catalog.max(pis.snapshot_at) AS latest_snapshot_at
    FROM public.portfolio_item_snapshots AS pis
    JOIN dirty
      ON dirty.wallet = pis.wallet_lower
     AND dirty.protocol = pis.name
     AND dirty.snapshot_date = pis.snapshot_date_utc
    GROUP BY pis.wallet_lower, pis.name, pis.snapshot_date_utc
  )
  INSERT INTO private.daily_portfolio_snapshots_cache (
    id,
    wallet,
    snapshot_at,
    snapshot_date,
    chain,
    has_supported_portfolio,
    id_raw,
    logo_url,
    name,
    site_url,
    asset_dict,
    asset_token_list,
    detail,
    detail_types,
    pool,
    proxy_detail,
    asset_usd_value,
    debt_usd_value,
    net_usd_value,
    update_at,
    name_item
  )
  SELECT
    pis.id,
    pis.wallet_lower,
    pis.snapshot_at,
    pis.snapshot_date_utc,
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
  FROM public.portfolio_item_snapshots AS pis
  JOIN latest_protocol_batch AS latest
    ON latest.wallet_lower = pis.wallet_lower
   AND latest.name = pis.name
   AND latest.snapshot_date_utc = pis.snapshot_date_utc
   AND latest.latest_snapshot_at = pis.snapshot_at;

  GET DIAGNOSTICS portfolio_rows_written = ROW_COUNT;

  DELETE FROM private.daily_wallet_token_snapshots_cache AS cache
  USING pg_catalog.jsonb_to_recordset(v_wallet_keys)
    AS dirty(wallet text, snapshot_date date)
  WHERE cache.user_wallet_address = dirty.wallet
    AND cache.snapshot_date::date = dirty.snapshot_date;

  WITH dirty AS (
    SELECT *
    FROM pg_catalog.jsonb_to_recordset(v_wallet_keys)
      AS keys(wallet text, snapshot_date date)
  ),
  latest_daily AS (
    SELECT
      pg_catalog.lower(wts.user_wallet_address) AS wallet,
      wts.inserted_at::date AS snapshot_date,
      pg_catalog.max(wts.time_at) AS latest_time_at
    FROM alpha_raw.wallet_token_snapshots AS wts
    JOIN dirty
      ON dirty.wallet = pg_catalog.lower(wts.user_wallet_address)
     AND dirty.snapshot_date = wts.inserted_at::date
    WHERE wts.is_wallet IS TRUE
    GROUP BY pg_catalog.lower(wts.user_wallet_address), wts.inserted_at::date
  )
  INSERT INTO private.daily_wallet_token_snapshots_cache (
    id,
    user_wallet_address,
    token_address,
    chain,
    name,
    symbol,
    display_symbol,
    optimized_symbol,
    decimals,
    logo_url,
    protocol_id,
    price,
    price_24h_change,
    is_verified,
    is_core,
    is_wallet,
    time_at,
    inserted_at,
    total_supply,
    credit_score,
    amount,
    raw_amount,
    raw_amount_hex_str,
    snapshot_date
  )
  SELECT
    wts.id,
    pg_catalog.lower(wts.user_wallet_address),
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
    wts.inserted_at
  FROM alpha_raw.wallet_token_snapshots AS wts
  JOIN latest_daily AS latest
    ON latest.wallet = pg_catalog.lower(wts.user_wallet_address)
   AND latest.snapshot_date = wts.inserted_at::date
   AND latest.latest_time_at = wts.time_at
  WHERE wts.is_wallet IS TRUE;

  GET DIAGNOSTICS wallet_rows_written = ROW_COUNT;

  WITH explicit_users AS (
    SELECT user_id
    FROM pg_catalog.jsonb_to_recordset(v_dirty_users)
      AS users(user_id text)
  ),
  dirty_wallets AS (
    SELECT wallet
    FROM pg_catalog.jsonb_to_recordset(v_portfolio_keys)
      AS portfolio(wallet text, protocol text, snapshot_date date)
    UNION
    SELECT wallet
    FROM pg_catalog.jsonb_to_recordset(v_wallet_keys)
      AS wallet(wallet text, snapshot_date date)
  ),
  affected AS (
    SELECT user_id
    FROM explicit_users
    UNION
    SELECT wallets.user_id::text
    FROM public.user_crypto_wallets AS wallets
    JOIN dirty_wallets
      ON dirty_wallets.wallet = pg_catalog.lower(wallets.wallet)
  )
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('user_id', affected.user_id)
    ),
    '[]'::jsonb
  )
  INTO v_affected_users
  FROM affected;

  users_processed := pg_catalog.jsonb_array_length(v_affected_users);

  DELETE FROM private.portfolio_category_trend_cache AS cache
  USING pg_catalog.jsonb_to_recordset(v_affected_users)
    AS affected(user_id text)
  WHERE cache.user_id::text = affected.user_id;

  WITH affected_users AS (
    SELECT user_id
    FROM pg_catalog.jsonb_to_recordset(v_affected_users)
      AS users(user_id text)
  ),
  user_wallets AS (
    SELECT wallets.user_id, pg_catalog.lower(wallets.wallet) AS wallet
    FROM public.user_crypto_wallets AS wallets
    JOIN affected_users
      ON affected_users.user_id = wallets.user_id::text
  ),
  portfolio_snapshots AS (
    SELECT
      wallets.user_id,
      snapshots.wallet,
      snapshots.snapshot_at,
      snapshots.asset_token_list
    FROM private.daily_portfolio_snapshots_cache AS snapshots
    JOIN user_wallets AS wallets
      ON snapshots.wallet = wallets.wallet
  ),
  defi_tokens AS (
    SELECT
      snapshots.user_id,
      (snapshots.snapshot_at AT TIME ZONE 'UTC')::date AS bucket_date,
      'defi'::text AS source_type,
      public.classify_token_category(token.value ->> 'symbol') AS category,
      (
        COALESCE(
          (token.value ->> 'amount')::numeric,
          0::numeric
        )
        *
        COALESCE(
          (token.value ->> 'price')::numeric,
          0::numeric
        )
      ) AS token_value
    FROM portfolio_snapshots AS snapshots
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
      snapshots.asset_token_list
    ) AS token(value)
    WHERE snapshots.asset_token_list IS NOT NULL
      AND pg_catalog.jsonb_array_length(snapshots.asset_token_list) > 0
  ),
  wallet_tokens AS (
    SELECT
      wallets.user_id,
      pg_catalog.date_trunc(
        'day',
        snapshots.inserted_at::timestamptz
      )::date AS bucket_date,
      'wallet'::text AS source_type,
      public.classify_token_category(snapshots.symbol) AS category,
      (
        COALESCE(snapshots.amount, 0::numeric)
        * COALESCE(snapshots.price, 0::numeric)
      ) AS token_value
    FROM private.daily_wallet_token_snapshots_cache AS snapshots
    JOIN user_wallets AS wallets
      ON snapshots.user_wallet_address = wallets.wallet
    WHERE snapshots.is_wallet IS TRUE
  ),
  all_tokens AS (
    SELECT *
    FROM defi_tokens
    WHERE token_value <> 0::numeric
    UNION ALL
    SELECT *
    FROM wallet_tokens
    WHERE token_value <> 0::numeric
  ),
  daily_aggregation AS (
    SELECT
      tokens.user_id,
      tokens.bucket_date,
      tokens.source_type,
      tokens.category,
      pg_catalog.sum(
        CASE
          WHEN tokens.token_value > 0::numeric THEN tokens.token_value
          ELSE 0::numeric
        END
      ) AS category_assets_usd,
      pg_catalog.sum(
        CASE
          WHEN tokens.token_value < 0::numeric
            THEN pg_catalog.abs(tokens.token_value)
          ELSE 0::numeric
        END
      ) AS category_debt_usd,
      pg_catalog.sum(tokens.token_value) AS category_value_usd
    FROM all_tokens AS tokens
    GROUP BY
      tokens.user_id,
      tokens.bucket_date,
      tokens.source_type,
      tokens.category
  ),
  daily_totals AS (
    SELECT
      daily.user_id,
      daily.bucket_date,
      pg_catalog.sum(daily.category_value_usd) AS total_value_usd
    FROM daily_aggregation AS daily
    GROUP BY daily.user_id, daily.bucket_date
  ),
  with_window_metrics AS (
    SELECT
      daily.user_id,
      daily.bucket_date,
      daily.source_type,
      daily.category,
      daily.category_value_usd,
      daily.category_assets_usd,
      daily.category_debt_usd,
      pg_catalog.lag(daily.category_value_usd) OVER (
        PARTITION BY daily.user_id, daily.source_type, daily.category
        ORDER BY daily.bucket_date
      ) AS prev_value_usd,
      totals.total_value_usd
    FROM daily_aggregation AS daily
    JOIN daily_totals AS totals
      ON daily.user_id = totals.user_id
     AND daily.bucket_date = totals.bucket_date
  )
  INSERT INTO private.portfolio_category_trend_cache (
    user_id,
    date,
    source_type,
    category,
    category_value_usd,
    category_assets_usd,
    category_debt_usd,
    pnl_usd,
    total_value_usd
  )
  SELECT
    metrics.user_id,
    metrics.bucket_date,
    metrics.source_type,
    metrics.category,
    metrics.category_value_usd,
    metrics.category_assets_usd,
    metrics.category_debt_usd,
    COALESCE(
      metrics.category_value_usd - metrics.prev_value_usd,
      0::numeric
    ),
    metrics.total_value_usd
  FROM with_window_metrics AS metrics;

  GET DIAGNOSTICS trend_rows_written = ROW_COUNT;

  SELECT pg_catalog.count(*)
  INTO remaining_portfolio_keys
  FROM private.portfolio_rollup_dirty_portfolio;

  SELECT pg_catalog.count(*)
  INTO remaining_wallet_keys
  FROM private.portfolio_rollup_dirty_wallet;

  SELECT pg_catalog.count(*)
  INTO remaining_users
  FROM private.portfolio_rollup_dirty_users;

  RETURN NEXT;
END
$$;

REVOKE ALL ON FUNCTION private.process_portfolio_rollup_queue(integer)
  FROM PUBLIC;

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['postgres', 'alpha_etl_user']::text[]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles
      WHERE rolname = role_name
    ) THEN
      EXECUTE pg_catalog.format(
        'GRANT USAGE ON SCHEMA private TO %I',
        role_name
      );
      EXECUTE pg_catalog.format(
        'GRANT EXECUTE ON FUNCTION private.process_portfolio_rollup_queue(integer) TO %I',
        role_name
      );
    END IF;
  END LOOP;
END
$$;

COMMENT ON FUNCTION private.process_portfolio_rollup_queue(integer) IS
  'Atomically drains dirty portfolio keys and incrementally rebuilds private daily/trend caches.';
