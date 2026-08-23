

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "alpha_raw";


ALTER SCHEMA "alpha_raw" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "analytics";


ALTER SCHEMA "analytics" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE SCHEMA IF NOT EXISTS "from_fed_to_chain";


ALTER SCHEMA "from_fed_to_chain" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "from_fed_to_chain_private";


ALTER SCHEMA "from_fed_to_chain_private" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "ops";


ALTER SCHEMA "ops" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE SCHEMA IF NOT EXISTS "review_web";


ALTER SCHEMA "review_web" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "hypopg" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "index_advisor" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."job_status" AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed',
    'retrying',
    'cancelled'
);


ALTER TYPE "public"."job_status" OWNER TO "postgres";


CREATE TYPE "public"."job_type" AS ENUM (
    'weekly_report_batch',
    'weekly_report_single',
    'email_notification'
);


ALTER TYPE "public"."job_type" OWNER TO "postgres";


CREATE TYPE "public"."log_level" AS ENUM (
    'INFO',
    'WARN',
    'ERROR',
    'DEBUG'
);


ALTER TYPE "public"."log_level" OWNER TO "postgres";


CREATE TYPE "public"."regime_id" AS ENUM (
    'ef',
    'f',
    'n',
    'g',
    'eg'
);


ALTER TYPE "public"."regime_id" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "alpha_raw"."create_etl_job_for_wallet"("p_user_id" "uuid", "p_wallet_address" character varying, "p_job_type" character varying DEFAULT 'wallet_onboarding'::character varying, "p_ip_address" character varying DEFAULT NULL::character varying, "p_user_agent" "text" DEFAULT NULL::"text") RETURNS TABLE("job_id" "uuid", "status" character varying, "message" "text", "rate_limited" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_job_id UUID;
    v_dedup_key VARCHAR(200);
    v_recent_jobs_count INTEGER;
    v_existing_job_id UUID;
BEGIN
    -- Generate deduplication key (wallet + clock hour)
    v_dedup_key := p_wallet_address || '_' || TO_CHAR(NOW(), 'YYYY-MM-DD-HH24');

    -- Rate limiting Layer 2: 2 jobs/hour per user (primary limit)
    SELECT COUNT(*) INTO v_recent_jobs_count
    FROM alpha_raw.etl_job_queue
    WHERE user_id = p_user_id
      AND created_at > NOW() - INTERVAL '1 hour';

    IF v_recent_jobs_count >= 2 THEN
        RETURN QUERY SELECT
            NULL::UUID,
            'rate_limited'::VARCHAR(20),
            'Rate limit exceeded: Maximum 2 jobs per hour per user'::TEXT,
            TRUE;
        RETURN;
    END IF;

    -- Rate limiting (secondary): 3 jobs/hour per IP (backup for shared users)
    IF p_ip_address IS NOT NULL THEN
        SELECT COUNT(*) INTO v_recent_jobs_count
        FROM alpha_raw.etl_job_queue
        WHERE ip_address = p_ip_address
          AND created_at > NOW() - INTERVAL '1 hour';

        IF v_recent_jobs_count >= 3 THEN
            RETURN QUERY SELECT
                NULL::UUID,
                'rate_limited'::VARCHAR(20),
                'Rate limit exceeded: Maximum 3 jobs per hour per IP'::TEXT,
                TRUE;
            RETURN;
        END IF;
    END IF;

    -- Check for existing pending/processing job for this wallet
    SELECT id INTO v_existing_job_id
    FROM alpha_raw.etl_job_queue
    WHERE wallet_address = p_wallet_address
      AND status IN ('pending', 'processing')
    LIMIT 1;

    IF v_existing_job_id IS NOT NULL THEN
        RETURN QUERY SELECT
            v_existing_job_id,
            'pending'::VARCHAR(20),
            'Job already queued'::TEXT,
            FALSE;
        RETURN;
    END IF;

    -- Deduplication: Check if data was recently fetched (within last hour)
    SELECT id INTO v_existing_job_id
    FROM alpha_raw.etl_job_queue
    WHERE dedup_key = v_dedup_key
      AND status = 'completed'
      AND completed_at > NOW() - INTERVAL '1 hour'
    LIMIT 1;

    IF v_existing_job_id IS NOT NULL THEN
        RETURN QUERY SELECT
            v_existing_job_id,
            'completed'::VARCHAR(20),
            'Data recently fetched'::TEXT,
            FALSE;
        RETURN;
    END IF;

    -- Create new job
    INSERT INTO alpha_raw.etl_job_queue (
        job_type, user_id, wallet_address, status, priority,
        dedup_key, ip_address, user_agent
    ) VALUES (
        p_job_type, p_user_id, p_wallet_address, 'pending',
        CASE WHEN p_job_type = 'wallet_onboarding' THEN 10 ELSE 5 END,
        v_dedup_key, p_ip_address, p_user_agent
    )
    RETURNING id INTO v_job_id;

    RETURN QUERY SELECT
        v_job_id,
        'pending'::VARCHAR(20),
        'ETL job created'::TEXT,
        FALSE;
END;
$$;


ALTER FUNCTION "alpha_raw"."create_etl_job_for_wallet"("p_user_id" "uuid", "p_wallet_address" character varying, "p_job_type" character varying, "p_ip_address" character varying, "p_user_agent" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "alpha_raw"."create_etl_job_for_wallet"("p_user_id" "uuid", "p_wallet_address" character varying, "p_job_type" character varying, "p_ip_address" character varying, "p_user_agent" "text") IS 'Creates ETL job with rate limiting (2/hr per user, 3/hr per IP) and deduplication';



CREATE OR REPLACE FUNCTION "alpha_raw"."get_next_etl_job"() RETURNS TABLE("id" "uuid", "job_type" character varying, "user_id" "uuid", "wallet_address" character varying, "status" character varying, "retry_count" integer, "max_retries" integer)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        q.id,
        q.job_type,
        q.user_id,
        q.wallet_address,
        q.status,
        q.retry_count,
        q.max_retries
    FROM alpha_raw.etl_job_queue q
    WHERE q.status = 'pending' AND q.scheduled_at <= NOW()
    ORDER BY q.priority DESC, q.scheduled_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
END;
$$;


ALTER FUNCTION "alpha_raw"."get_next_etl_job"() OWNER TO "postgres";


COMMENT ON FUNCTION "alpha_raw"."get_next_etl_job"() IS 'Gets next pending job with row lock for concurrent-safe polling';



CREATE OR REPLACE FUNCTION "analytics"."rebuild_category_trends"("p_user_ids" "text"[] DEFAULT NULL::"text"[]) RETURNS TABLE("users_processed" bigint, "trend_rows_written" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  v_user_ids text[];
BEGIN
  IF p_user_ids IS NOT NULL
     AND pg_catalog.cardinality(p_user_ids) = 0 THEN
    RAISE EXCEPTION 'p_user_ids must not be empty when provided';
  END IF;

  IF p_user_ids IS NULL THEN
    SELECT pg_catalog.array_agg(DISTINCT wallets.user_id::text)
    INTO v_user_ids
    FROM public.user_crypto_wallets AS wallets;
  ELSE
    SELECT pg_catalog.array_agg(DISTINCT requested.user_id)
    INTO v_user_ids
    FROM pg_catalog.unnest(p_user_ids) AS requested(user_id);
  END IF;

  users_processed := COALESCE(pg_catalog.cardinality(v_user_ids), 0);
  trend_rows_written := 0;

  IF v_user_ids IS NULL THEN
    RETURN NEXT;
    RETURN;
  END IF;

  -- ETL calls and manual runs share this writer; a concurrent caller waits,
  -- then recomputes idempotently.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('analytics.rebuild_category_trends', 0)
  );

  DELETE FROM analytics.daily_category_trends AS trends
  WHERE trends.user_id::text = ANY (v_user_ids);

  WITH user_wallets AS (
    SELECT wallets.user_id, pg_catalog.lower(wallets.wallet) AS wallet
    FROM public.user_crypto_wallets AS wallets
    WHERE wallets.user_id::text = ANY (v_user_ids)
  ),
  portfolio_snapshots AS (
    SELECT
      wallets.user_id,
      snapshots.wallet,
      snapshots.snapshot_at,
      snapshots.asset_token_list
    FROM analytics.daily_portfolio_positions AS snapshots
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
      snapshots.snapshot_date AS bucket_date,
      'wallet'::text AS source_type,
      public.classify_token_category(snapshots.symbol) AS category,
      (
        COALESCE(snapshots.amount, 0::numeric)
        * COALESCE(snapshots.price, 0::numeric)
      ) AS token_value
    FROM analytics.daily_wallet_tokens AS snapshots
    JOIN user_wallets AS wallets
      ON snapshots.user_wallet_address = wallets.wallet
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
  INSERT INTO analytics.daily_category_trends (
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

  RETURN NEXT;
END
$$;


ALTER FUNCTION "analytics"."rebuild_category_trends"("p_user_ids" "text"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "analytics"."rebuild_category_trends"("p_user_ids" "text"[]) IS 'Recomputes analytics.daily_category_trends for the given users (NULL = every user in user_crypto_wallets) from the canonical daily tables.';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "from_fed_to_chain"."episode_videos" (
    "episode_localization_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "manifest" "jsonb",
    "manifest_hash" "text",
    "renderer_version" "text",
    "storyboard_provider" "text",
    "storyboard_model" "text",
    "storyboard_prompt_version" "text",
    "script_hash" "text",
    "mp4_url" "text",
    "thumbnail_url" "text",
    "manifest_url" "text",
    "captions_ass_url" "text",
    "r2_prefix" "text",
    "duration_seconds" double precision,
    "telegram_chat_id" "text",
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "next_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lease_owner" "text",
    "lease_expires_at" timestamp with time zone,
    "last_error" "text",
    "failure_notified_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "episode_id" "uuid" NOT NULL,
    "visual_hash" "text",
    "visual_version" "text" NOT NULL,
    "progress_percent" smallint,
    "progress_stage" "text",
    CONSTRAINT "episode_videos_attempt_count_check" CHECK ((("attempt_count" >= 0) AND ("attempt_count" <= 3))),
    CONSTRAINT "episode_videos_completed_has_assets" CHECK ((("status" <> 'completed'::"text") OR ((NULLIF("btrim"("visual_hash"), ''::"text") IS NOT NULL) AND (NULLIF("btrim"("visual_version"), ''::"text") IS NOT NULL) AND ("manifest" IS NOT NULL) AND (NULLIF("btrim"("manifest_hash"), ''::"text") IS NOT NULL) AND (NULLIF("btrim"("renderer_version"), ''::"text") IS NOT NULL) AND (NULLIF("btrim"("storyboard_provider"), ''::"text") IS NOT NULL) AND (NULLIF("btrim"("storyboard_prompt_version"), ''::"text") IS NOT NULL) AND (NULLIF("btrim"("script_hash"), ''::"text") IS NOT NULL) AND (NULLIF("btrim"("mp4_url"), ''::"text") IS NOT NULL) AND (NULLIF("btrim"("thumbnail_url"), ''::"text") IS NOT NULL) AND (NULLIF("btrim"("manifest_url"), ''::"text") IS NOT NULL) AND (NULLIF("btrim"("captions_ass_url"), ''::"text") IS NOT NULL) AND (NULLIF("btrim"("r2_prefix"), ''::"text") IS NOT NULL) AND ("duration_seconds" IS NOT NULL) AND ("duration_seconds" > (0)::double precision) AND ("completed_at" IS NOT NULL)))),
    CONSTRAINT "episode_videos_manifest_is_object" CHECK ((("manifest" IS NULL) OR ("jsonb_typeof"("manifest") = 'object'::"text"))),
    CONSTRAINT "episode_videos_processing_has_lease" CHECK (((("status" = 'processing'::"text") AND ("attempt_count" > 0) AND ("lease_owner" IS NOT NULL) AND ("btrim"("lease_owner") <> ''::"text") AND ("lease_expires_at" IS NOT NULL)) OR (("status" <> 'processing'::"text") AND ("lease_owner" IS NULL) AND ("lease_expires_at" IS NULL)))),
    CONSTRAINT "episode_videos_progress_percent_range" CHECK ((("progress_percent" IS NULL) OR (("progress_percent" >= 0) AND ("progress_percent" <= 100)))),
    CONSTRAINT "episode_videos_progress_stage_known" CHECK ((("progress_stage" IS NULL) OR ("progress_stage" = ANY (ARRAY['analyzing-audio'::"text", 'aligning-script'::"text", 'preparing-media'::"text", 'encoding'::"text", 'uploading-video'::"text"])))),
    CONSTRAINT "episode_videos_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "from_fed_to_chain"."episode_videos" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "from_fed_to_chain"."claim_episode_video"("p_lease_owner" "text") RETURNS SETOF "from_fed_to_chain"."episode_videos"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  -- Deprecation fence: see claim_episode_video_visual above.
  return;
end;
$$;


ALTER FUNCTION "from_fed_to_chain"."claim_episode_video"("p_lease_owner" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "from_fed_to_chain"."claim_episode_video_v2"("p_lease_owner" "text", "p_visual_version" "text") RETURNS SETOF "from_fed_to_chain"."episode_videos"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if nullif(btrim(p_lease_owner), '') is null then
    raise exception 'p_lease_owner must not be empty'
      using errcode = '22023';
  end if;

  if nullif(btrim(p_visual_version), '') is null then
    raise exception 'p_visual_version must not be empty'
      using errcode = '22023';
  end if;

  update from_fed_to_chain.episode_videos video
  set status = case
        when video.attempt_count >= 3 then 'failed'
        else 'queued'
      end,
      next_attempt_at = case video.attempt_count
        when 1 then now() + interval '1 minute'
        when 2 then now() + interval '5 minutes'
        else now()
      end,
      lease_owner = null,
      lease_expires_at = null,
      last_error = coalesce(video.last_error, 'Worker lease expired'),
      updated_at = now()
  where video.status = 'processing'
    and video.lease_expires_at <= now();

  return query
  with candidate as (
    select video.episode_localization_id
    from from_fed_to_chain.episode_videos video
    join from_fed_to_chain.episode_video_visuals visual
      on visual.episode_id = video.episode_id
      and visual.visual_hash = video.visual_hash
      and visual.visual_version = video.visual_version
    join from_fed_to_chain.episode_localizations localization
      on localization.id = video.episode_localization_id
    where video.status = 'queued'
      and video.next_attempt_at <= now()
      and video.attempt_count < 3
      and video.visual_version = btrim(p_visual_version)
      and visual.status = 'completed'
      and localization.language_code in ('zh-Hant', 'ja', 'en')
      and localization.status = 'completed'
      and nullif(btrim(localization.script), '') is not null
      and nullif(btrim(localization.hls_url), '') is not null
      and (
        localization.language_code <> 'zh-Hant'
        or nullif(btrim(localization.classroom_hls_url), '') is not null
      )
    order by video.next_attempt_at, video.created_at
    limit 1
    for update of video skip locked
  )
  update from_fed_to_chain.episode_videos video
  set status = 'processing',
      attempt_count = video.attempt_count + 1,
      lease_owner = btrim(p_lease_owner),
      lease_expires_at = now() + interval '10 minutes',
      started_at = coalesce(video.started_at, now()),
      progress_percent = null,
      progress_stage = null,
      updated_at = now()
  from candidate
  where video.episode_localization_id = candidate.episode_localization_id
  returning video.*;
end;
$$;


ALTER FUNCTION "from_fed_to_chain"."claim_episode_video_v2"("p_lease_owner" "text", "p_visual_version" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "from_fed_to_chain"."episode_video_visuals" (
    "episode_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "visual_payload" "jsonb",
    "visual_hash" "text",
    "visual_version" "text" NOT NULL,
    "source_hash" "text" NOT NULL,
    "r2_prefix" "text",
    "telegram_chat_id" "text",
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "next_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lease_owner" "text",
    "lease_expires_at" timestamp with time zone,
    "last_error" "text",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "progress_percent" smallint,
    "progress_stage" "text",
    CONSTRAINT "episode_video_visuals_attempt_count_check" CHECK ((("attempt_count" >= 0) AND ("attempt_count" <= 3))),
    CONSTRAINT "episode_video_visuals_completed_has_payload" CHECK ((("status" <> 'completed'::"text") OR (("visual_payload" IS NOT NULL) AND (NULLIF("btrim"("visual_hash"), ''::"text") IS NOT NULL) AND (NULLIF("btrim"("r2_prefix"), ''::"text") IS NOT NULL) AND ("completed_at" IS NOT NULL)))),
    CONSTRAINT "episode_video_visuals_payload_is_object" CHECK ((("visual_payload" IS NULL) OR ("jsonb_typeof"("visual_payload") = 'object'::"text"))),
    CONSTRAINT "episode_video_visuals_processing_has_lease" CHECK (((("status" = 'processing'::"text") AND ("attempt_count" > 0) AND ("lease_owner" IS NOT NULL) AND ("btrim"("lease_owner") <> ''::"text") AND ("lease_expires_at" IS NOT NULL)) OR (("status" <> 'processing'::"text") AND ("lease_owner" IS NULL) AND ("lease_expires_at" IS NULL)))),
    CONSTRAINT "episode_video_visuals_progress_percent_range" CHECK ((("progress_percent" IS NULL) OR (("progress_percent" >= 0) AND ("progress_percent" <= 100)))),
    CONSTRAINT "episode_video_visuals_progress_stage_known" CHECK ((("progress_stage" IS NULL) OR ("progress_stage" = ANY (ARRAY['analyzing-audio'::"text", 'planning-scenes'::"text", 'selecting-images'::"text", 'uploading-visuals'::"text"])))),
    CONSTRAINT "episode_video_visuals_source_hash_not_empty" CHECK ((NULLIF("btrim"("source_hash"), ''::"text") IS NOT NULL)),
    CONSTRAINT "episode_video_visuals_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"]))),
    CONSTRAINT "episode_video_visuals_version_not_empty" CHECK ((NULLIF("btrim"("visual_version"), ''::"text") IS NOT NULL))
);


ALTER TABLE "from_fed_to_chain"."episode_video_visuals" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "from_fed_to_chain"."claim_episode_video_visual"("p_lease_owner" "text") RETURNS SETOF "from_fed_to_chain"."episode_video_visuals"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  -- Deprecation fence: pre-021 workers poll this signature. Return no rows
  -- so they idle quietly and never claim jobs enqueued by newer code.
  -- Current workers call claim_episode_video_visual_v2 instead.
  return;
end;
$$;


ALTER FUNCTION "from_fed_to_chain"."claim_episode_video_visual"("p_lease_owner" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "from_fed_to_chain"."claim_episode_video_visual_v2"("p_lease_owner" "text", "p_visual_version" "text") RETURNS SETOF "from_fed_to_chain"."episode_video_visuals"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if nullif(btrim(p_lease_owner), '') is null then
    raise exception 'p_lease_owner must not be empty'
      using errcode = '22023';
  end if;

  if nullif(btrim(p_visual_version), '') is null then
    raise exception 'p_visual_version must not be empty'
      using errcode = '22023';
  end if;

  update from_fed_to_chain.episode_video_visuals visual
  set status = case
        when visual.attempt_count >= 3 then 'failed'
        else 'queued'
      end,
      next_attempt_at = case visual.attempt_count
        when 1 then now() + interval '1 minute'
        when 2 then now() + interval '5 minutes'
        else now()
      end,
      lease_owner = null,
      lease_expires_at = null,
      last_error = coalesce(visual.last_error, 'Worker lease expired'),
      updated_at = now()
  where visual.status = 'processing'
    and visual.lease_expires_at <= now();

  return query
  with candidate as (
    select visual.episode_id
    from from_fed_to_chain.episode_video_visuals visual
    where visual.status = 'queued'
      and visual.next_attempt_at <= now()
      and visual.attempt_count < 3
      and visual.visual_version = btrim(p_visual_version)
    order by visual.next_attempt_at, visual.created_at
    limit 1
    for update skip locked
  )
  update from_fed_to_chain.episode_video_visuals visual
  set status = 'processing',
      attempt_count = visual.attempt_count + 1,
      lease_owner = btrim(p_lease_owner),
      lease_expires_at = now() + interval '10 minutes',
      started_at = coalesce(visual.started_at, now()),
      progress_percent = null,
      progress_stage = null,
      updated_at = now()
  from candidate
  where visual.episode_id = candidate.episode_id
  returning visual.*;
end;
$$;


ALTER FUNCTION "from_fed_to_chain"."claim_episode_video_visual_v2"("p_lease_owner" "text", "p_visual_version" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "from_fed_to_chain"."social_publish_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "episode_id" "uuid" NOT NULL,
    "platform" "text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "scheduled_at" timestamp with time zone NOT NULL,
    "next_attempt_at" timestamp with time zone NOT NULL,
    "strategy_version_id" "uuid",
    "social_post_id" "uuid",
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "lease_owner" "text",
    "lease_expires_at" timestamp with time zone,
    "last_error" "text",
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "social_publish_jobs_attempt_count_check" CHECK ((("attempt_count" >= 0) AND ("attempt_count" <= 8))),
    CONSTRAINT "social_publish_jobs_completed_has_timestamp" CHECK ((("status" <> 'completed'::"text") OR ("completed_at" IS NOT NULL))),
    CONSTRAINT "social_publish_jobs_platform_check" CHECK (("platform" = ANY (ARRAY['x'::"text", 'threads'::"text", 'rednote'::"text", 'youtube'::"text"]))),
    CONSTRAINT "social_publish_jobs_processing_has_lease" CHECK (((("status" = 'processing'::"text") AND (NULLIF("btrim"("lease_owner"), ''::"text") IS NOT NULL) AND ("lease_expires_at" IS NOT NULL)) OR (("status" <> 'processing'::"text") AND ("lease_owner" IS NULL) AND ("lease_expires_at" IS NULL)))),
    CONSTRAINT "social_publish_jobs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "from_fed_to_chain"."social_publish_jobs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "from_fed_to_chain"."claim_social_publish_batch"("p_owner" "text", "p_now" timestamp with time zone DEFAULT "now"()) RETURNS SETOF "from_fed_to_chain"."social_publish_jobs"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'from_fed_to_chain', 'pg_temp'
    AS $$
declare
  seed_episode_id uuid;
begin
  if nullif(btrim(p_owner), '') is null then
    raise exception 'p_owner must not be blank';
  end if;

  select job.episode_id
    into seed_episode_id
  from from_fed_to_chain.social_publish_jobs job
  where job.scheduled_at <= p_now
    and job.attempt_count < 8
    and (
      (job.status in ('queued', 'failed') and job.next_attempt_at <= p_now)
      or (job.status = 'processing' and job.lease_expires_at <= p_now)
    )
  order by job.scheduled_at asc, job.created_at asc
  for update skip locked
  limit 1;

  if seed_episode_id is null then
    return;
  end if;

  return query
  update from_fed_to_chain.social_publish_jobs job
  set
    status = 'processing',
    attempt_count = job.attempt_count + 1,
    lease_owner = p_owner,
    lease_expires_at = p_now + interval '60 minutes',
    last_error = null,
    updated_at = p_now
  where job.episode_id = seed_episode_id
    and job.scheduled_at <= p_now
    and job.attempt_count < 8
    and (
      (job.status in ('queued', 'failed') and job.next_attempt_at <= p_now)
      or (job.status = 'processing' and job.lease_expires_at <= p_now)
    )
  returning job.*;
end;
$$;


ALTER FUNCTION "from_fed_to_chain"."claim_social_publish_batch"("p_owner" "text", "p_now" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "from_fed_to_chain"."complete_episode_video"("p_episode_localization_id" "uuid", "p_lease_owner" "text", "p_mp4_url" "text", "p_thumbnail_url" "text", "p_manifest_url" "text", "p_captions_ass_url" "text", "p_r2_prefix" "text", "p_duration_seconds" double precision) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  updated_rows integer;
begin
  update from_fed_to_chain.episode_videos video
  set status = 'completed',
      mp4_url = p_mp4_url,
      thumbnail_url = p_thumbnail_url,
      manifest_url = p_manifest_url,
      captions_ass_url = p_captions_ass_url,
      r2_prefix = p_r2_prefix,
      duration_seconds = p_duration_seconds,
      lease_owner = null,
      lease_expires_at = null,
      last_error = null,
      completed_at = now(),
      updated_at = now()
  where video.episode_localization_id = p_episode_localization_id
    and video.status = 'processing'
    and video.lease_owner = p_lease_owner
    and video.lease_expires_at > now()
    and exists (
      select 1
      from from_fed_to_chain.episode_video_visuals visual
      where visual.episode_id = video.episode_id
        and visual.status = 'completed'
        and visual.visual_hash = video.visual_hash
        and visual.visual_version = video.visual_version
    );

  get diagnostics updated_rows = row_count;
  return updated_rows = 1;
end;
$$;


ALTER FUNCTION "from_fed_to_chain"."complete_episode_video"("p_episode_localization_id" "uuid", "p_lease_owner" "text", "p_mp4_url" "text", "p_thumbnail_url" "text", "p_manifest_url" "text", "p_captions_ass_url" "text", "p_r2_prefix" "text", "p_duration_seconds" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "from_fed_to_chain"."complete_episode_video_visual"("p_episode_id" "uuid", "p_lease_owner" "text", "p_visual_payload" "jsonb", "p_visual_hash" "text", "p_visual_version" "text", "p_source_hash" "text", "p_r2_prefix" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  updated_rows integer;
begin
  if p_visual_payload is null
      or jsonb_typeof(p_visual_payload) <> 'object'
      or nullif(btrim(p_visual_hash), '') is null
      or nullif(btrim(p_r2_prefix), '') is null then
    raise exception 'Completed episode video visuals require payload, hash, and R2 prefix'
      using errcode = '22023';
  end if;

  update from_fed_to_chain.episode_video_visuals visual
  set status = 'completed',
      visual_payload = p_visual_payload,
      visual_hash = btrim(p_visual_hash),
      r2_prefix = btrim(p_r2_prefix),
      lease_owner = null,
      lease_expires_at = null,
      last_error = null,
      completed_at = now(),
      updated_at = now()
  where visual.episode_id = p_episode_id
    and visual.status = 'processing'
    and visual.lease_owner = p_lease_owner
    and visual.lease_expires_at > now()
    and visual.visual_version = btrim(p_visual_version)
    and visual.source_hash = btrim(p_source_hash);

  get diagnostics updated_rows = row_count;
  if updated_rows <> 1 then
    return false;
  end if;

  update from_fed_to_chain.episode_videos video
  set status = 'queued',
      visual_hash = btrim(p_visual_hash),
      visual_version = btrim(p_visual_version),
      manifest = null,
      manifest_hash = null,
      renderer_version = null,
      storyboard_provider = null,
      storyboard_model = null,
      storyboard_prompt_version = null,
      script_hash = null,
      mp4_url = null,
      thumbnail_url = null,
      manifest_url = null,
      captions_ass_url = null,
      r2_prefix = null,
      duration_seconds = null,
      attempt_count = 0,
      next_attempt_at = now(),
      lease_owner = null,
      lease_expires_at = null,
      last_error = null,
      failure_notified_at = null,
      started_at = null,
      completed_at = null,
      updated_at = now()
  where video.episode_id = p_episode_id
    and (
      video.visual_hash is distinct from btrim(p_visual_hash)
      or video.visual_version is distinct from btrim(p_visual_version)
    );

  return true;
end;
$$;


ALTER FUNCTION "from_fed_to_chain"."complete_episode_video_visual"("p_episode_id" "uuid", "p_lease_owner" "text", "p_visual_payload" "jsonb", "p_visual_hash" "text", "p_visual_version" "text", "p_source_hash" "text", "p_r2_prefix" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "from_fed_to_chain"."enqueue_episode_video"("p_episode_localization_id" "uuid", "p_telegram_chat_id" "text" DEFAULT NULL::"text") RETURNS SETOF "from_fed_to_chain"."episode_videos"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  localization_record record;
  visual_record record;
  current_status text;
  current_visual_hash text;
  current_visual_version text;
  target_visual_hash text;
begin
  select
    localization.episode_id,
    localization.language_code,
    localization.status,
    localization.script,
    localization.hls_url,
    localization.classroom_hls_url
  into localization_record
  from from_fed_to_chain.episode_localizations localization
  where localization.id = p_episode_localization_id;

  if localization_record is null
      or localization_record.language_code not in ('zh-Hant', 'ja', 'en')
      or localization_record.status <> 'completed'
      or nullif(btrim(localization_record.script), '') is null
      or nullif(btrim(localization_record.hls_url), '') is null
      or (
        localization_record.language_code = 'zh-Hant'
        and nullif(btrim(localization_record.classroom_hls_url), '') is null
      ) then
    raise exception 'Episode video jobs require completed zh-Hant, ja, or en audio (plus zh-Hant classroom audio)'
      using errcode = '22023';
  end if;

  select
    visual.status,
    visual.visual_hash,
    visual.visual_version
  into visual_record
  from from_fed_to_chain.episode_video_visuals visual
  where visual.episode_id = localization_record.episode_id
  for share;

  if visual_record is null then
    raise exception 'Episode video visual job must be enqueued first'
      using errcode = '22023';
  end if;

  target_visual_hash := case
    when visual_record.status = 'completed' then visual_record.visual_hash
    else null
  end;

  insert into from_fed_to_chain.episode_videos (
    episode_localization_id,
    episode_id,
    visual_hash,
    visual_version,
    telegram_chat_id
  )
  values (
    p_episode_localization_id,
    localization_record.episode_id,
    target_visual_hash,
    visual_record.visual_version,
    nullif(btrim(p_telegram_chat_id), '')
  )
  on conflict (episode_localization_id) do nothing;

  select video.status, video.visual_hash, video.visual_version
  into current_status, current_visual_hash, current_visual_version
  from from_fed_to_chain.episode_videos video
  where video.episode_localization_id = p_episode_localization_id
  for update;

  if current_status = 'failed'
      or current_visual_hash is distinct from target_visual_hash
      or current_visual_version is distinct from visual_record.visual_version
      or (
        current_status = 'completed'
        and visual_record.status <> 'completed'
      ) then
    update from_fed_to_chain.episode_videos video
    set status = 'queued',
        episode_id = localization_record.episode_id,
        visual_hash = target_visual_hash,
        visual_version = visual_record.visual_version,
        manifest = null,
        manifest_hash = null,
        renderer_version = null,
        storyboard_provider = null,
        storyboard_model = null,
        storyboard_prompt_version = null,
        script_hash = null,
        mp4_url = null,
        thumbnail_url = null,
        manifest_url = null,
        captions_ass_url = null,
        r2_prefix = null,
        duration_seconds = null,
        telegram_chat_id = coalesce(
          nullif(btrim(p_telegram_chat_id), ''),
          video.telegram_chat_id
        ),
        attempt_count = 0,
        next_attempt_at = now(),
        lease_owner = null,
        lease_expires_at = null,
        last_error = null,
        failure_notified_at = null,
        started_at = null,
        completed_at = null,
        updated_at = now()
    where video.episode_localization_id = p_episode_localization_id;
  elsif current_status in ('queued', 'processing')
        and nullif(btrim(p_telegram_chat_id), '') is not null then
    update from_fed_to_chain.episode_videos video
    set telegram_chat_id = nullif(btrim(p_telegram_chat_id), ''),
        updated_at = now()
    where video.episode_localization_id = p_episode_localization_id;
  end if;

  return query
  select video.*
  from from_fed_to_chain.episode_videos video
  where video.episode_localization_id = p_episode_localization_id;
end;
$$;


ALTER FUNCTION "from_fed_to_chain"."enqueue_episode_video"("p_episode_localization_id" "uuid", "p_telegram_chat_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "from_fed_to_chain"."enqueue_episode_video_visual"("p_episode_id" "uuid", "p_visual_version" "text", "p_source_hash" "text", "p_telegram_chat_id" "text" DEFAULT NULL::"text") RETURNS SETOF "from_fed_to_chain"."episode_video_visuals"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  current_status text;
  current_visual_version text;
  current_source_hash text;
begin
  if nullif(btrim(p_visual_version), '') is null then
    raise exception 'p_visual_version must not be empty'
      using errcode = '22023';
  end if;
  if nullif(btrim(p_source_hash), '') is null then
    raise exception 'p_source_hash must not be empty'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from from_fed_to_chain.episode_localizations localization
    where localization.episode_id = p_episode_id
      and localization.language_code = 'zh-Hant'
      and localization.status = 'completed'
      and nullif(btrim(localization.script), '') is not null
      and nullif(btrim(localization.hls_url), '') is not null
      and nullif(btrim(localization.classroom_hls_url), '') is not null
  ) then
    raise exception 'Episode video visuals require completed zh-Hant script, main audio, and classroom audio'
      using errcode = '22023';
  end if;

  insert into from_fed_to_chain.episode_video_visuals (
    episode_id,
    visual_version,
    source_hash,
    telegram_chat_id
  )
  values (
    p_episode_id,
    btrim(p_visual_version),
    btrim(p_source_hash),
    nullif(btrim(p_telegram_chat_id), '')
  )
  on conflict (episode_id) do nothing;

  select visual.status, visual.visual_version, visual.source_hash
  into current_status, current_visual_version, current_source_hash
  from from_fed_to_chain.episode_video_visuals visual
  where visual.episode_id = p_episode_id
  for update;

  if current_status = 'failed'
      or current_visual_version is distinct from btrim(p_visual_version)
      or current_source_hash is distinct from btrim(p_source_hash) then
    update from_fed_to_chain.episode_videos video
    set status = 'queued',
        visual_hash = null,
        visual_version = btrim(p_visual_version),
        manifest = null,
        manifest_hash = null,
        renderer_version = null,
        storyboard_provider = null,
        storyboard_model = null,
        storyboard_prompt_version = null,
        script_hash = null,
        mp4_url = null,
        thumbnail_url = null,
        manifest_url = null,
        captions_ass_url = null,
        r2_prefix = null,
        duration_seconds = null,
        attempt_count = 0,
        next_attempt_at = now(),
        lease_owner = null,
        lease_expires_at = null,
        last_error = null,
        failure_notified_at = null,
        started_at = null,
        completed_at = null,
        updated_at = now()
    where video.episode_id = p_episode_id;

    update from_fed_to_chain.episode_video_visuals visual
    set status = 'queued',
        visual_payload = null,
        visual_hash = null,
        visual_version = btrim(p_visual_version),
        source_hash = btrim(p_source_hash),
        r2_prefix = null,
        telegram_chat_id = coalesce(
          nullif(btrim(p_telegram_chat_id), ''),
          visual.telegram_chat_id
        ),
        attempt_count = 0,
        next_attempt_at = now(),
        lease_owner = null,
        lease_expires_at = null,
        last_error = null,
        started_at = null,
        completed_at = null,
        updated_at = now()
    where visual.episode_id = p_episode_id;
  elsif current_status in ('queued', 'processing')
        and nullif(btrim(p_telegram_chat_id), '') is not null then
    update from_fed_to_chain.episode_video_visuals visual
    set telegram_chat_id = nullif(btrim(p_telegram_chat_id), ''),
        updated_at = now()
    where visual.episode_id = p_episode_id;
  end if;

  return query
  select visual.*
  from from_fed_to_chain.episode_video_visuals visual
  where visual.episode_id = p_episode_id;
end;
$$;


ALTER FUNCTION "from_fed_to_chain"."enqueue_episode_video_visual"("p_episode_id" "uuid", "p_visual_version" "text", "p_source_hash" "text", "p_telegram_chat_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "from_fed_to_chain"."fail_episode_video"("p_episode_localization_id" "uuid", "p_lease_owner" "text", "p_last_error" "text") RETURNS SETOF "from_fed_to_chain"."episode_videos"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return query
  update from_fed_to_chain.episode_videos video
  set status = case
        when video.attempt_count >= 3 then 'failed'
        else 'queued'
      end,
      next_attempt_at = case video.attempt_count
        when 1 then now() + interval '1 minute'
        when 2 then now() + interval '5 minutes'
        else now()
      end,
      lease_owner = null,
      lease_expires_at = null,
      last_error = left(
        coalesce(nullif(btrim(p_last_error), ''), 'Unknown video worker error'),
        4000
      ),
      updated_at = now()
  where video.episode_localization_id = p_episode_localization_id
    and video.status = 'processing'
    and video.lease_owner = p_lease_owner
    and video.lease_expires_at > now()
  returning video.*;
end;
$$;


ALTER FUNCTION "from_fed_to_chain"."fail_episode_video"("p_episode_localization_id" "uuid", "p_lease_owner" "text", "p_last_error" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "from_fed_to_chain"."fail_episode_video_visual"("p_episode_id" "uuid", "p_lease_owner" "text", "p_last_error" "text") RETURNS SETOF "from_fed_to_chain"."episode_video_visuals"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return query
  update from_fed_to_chain.episode_video_visuals visual
  set status = case
        when visual.attempt_count >= 3 then 'failed'
        else 'queued'
      end,
      next_attempt_at = case visual.attempt_count
        when 1 then now() + interval '1 minute'
        when 2 then now() + interval '5 minutes'
        else now()
      end,
      lease_owner = null,
      lease_expires_at = null,
      last_error = left(
        coalesce(
          nullif(btrim(p_last_error), ''),
          'Unknown video visual worker error'
        ),
        4000
      ),
      updated_at = now()
  where visual.episode_id = p_episode_id
    and visual.status = 'processing'
    and visual.lease_owner = p_lease_owner
    and visual.lease_expires_at > now()
  returning visual.*;
end;
$$;


ALTER FUNCTION "from_fed_to_chain"."fail_episode_video_visual"("p_episode_id" "uuid", "p_lease_owner" "text", "p_last_error" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "from_fed_to_chain"."mark_episode_video_failure_notified"("p_episode_localization_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  updated_rows integer;
begin
  update from_fed_to_chain.episode_videos video
  set failure_notified_at = now(),
      updated_at = now()
  where video.episode_localization_id = p_episode_localization_id
    and video.status = 'failed'
    and video.failure_notified_at is null;

  get diagnostics updated_rows = row_count;
  return updated_rows = 1;
end;
$$;


ALTER FUNCTION "from_fed_to_chain"."mark_episode_video_failure_notified"("p_episode_localization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "from_fed_to_chain"."ops_insert_cost_transaction"("p_provider" "text", "p_amount_usd" numeric, "p_charged_at" timestamp with time zone, "p_kind" "text", "p_source" "text", "p_external_id" "text", "p_description" "text") RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  insert into ops.cost_transactions (
    provider,
    amount_usd,
    charged_at,
    kind,
    source,
    external_id,
    description
  )
  values (
    p_provider,
    p_amount_usd,
    p_charged_at,
    p_kind,
    p_source,
    p_external_id,
    p_description
  );
$$;


ALTER FUNCTION "from_fed_to_chain"."ops_insert_cost_transaction"("p_provider" "text", "p_amount_usd" numeric, "p_charged_at" timestamp with time zone, "p_kind" "text", "p_source" "text", "p_external_id" "text", "p_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "from_fed_to_chain"."ops_upsert_cost_snapshot"("p_provider" "text", "p_snapshot_date" "date", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_accrued_cost_usd" numeric, "p_projected_cost_usd" numeric, "p_cost_type" "text", "p_source" "text", "p_usage" "jsonb", "p_pricing_rate_id" "uuid", "p_fetched_at" timestamp with time zone, "p_updated_at" timestamp with time zone) RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  insert into ops.cost_snapshots (
    provider,
    snapshot_date,
    period_start,
    period_end,
    accrued_cost_usd,
    projected_cost_usd,
    cost_type,
    source,
    usage,
    pricing_rate_id,
    fetched_at,
    updated_at
  )
  values (
    p_provider,
    p_snapshot_date,
    p_period_start,
    p_period_end,
    p_accrued_cost_usd,
    p_projected_cost_usd,
    p_cost_type,
    p_source,
    p_usage,
    p_pricing_rate_id,
    p_fetched_at,
    p_updated_at
  )
  on conflict (provider, snapshot_date) do update set
    period_start = excluded.period_start,
    period_end = excluded.period_end,
    accrued_cost_usd = excluded.accrued_cost_usd,
    projected_cost_usd = excluded.projected_cost_usd,
    cost_type = excluded.cost_type,
    source = excluded.source,
    usage = excluded.usage,
    pricing_rate_id = excluded.pricing_rate_id,
    fetched_at = excluded.fetched_at,
    updated_at = excluded.updated_at;
$$;


ALTER FUNCTION "from_fed_to_chain"."ops_upsert_cost_snapshot"("p_provider" "text", "p_snapshot_date" "date", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_accrued_cost_usd" numeric, "p_projected_cost_usd" numeric, "p_cost_type" "text", "p_source" "text", "p_usage" "jsonb", "p_pricing_rate_id" "uuid", "p_fetched_at" timestamp with time zone, "p_updated_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "from_fed_to_chain"."reap_failed_episode_video_notifications"("p_limit" integer DEFAULT 20) RETURNS TABLE("episode_localization_id" "uuid", "telegram_chat_id" "text", "episode_id" "uuid", "last_error" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  return query
  select
    video.episode_localization_id,
    video.telegram_chat_id,
    localization.episode_id,
    video.last_error
  from from_fed_to_chain.episode_videos video
  join from_fed_to_chain.episode_localizations localization
    on localization.id = video.episode_localization_id
  where video.status = 'failed'
    and video.telegram_chat_id is not null
    and video.failure_notified_at is null
  order by video.updated_at
  limit greatest(coalesce(p_limit, 20), 1);
end;
$$;


ALTER FUNCTION "from_fed_to_chain"."reap_failed_episode_video_notifications"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "from_fed_to_chain"."renew_episode_video_lease"("p_episode_localization_id" "uuid", "p_lease_owner" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  updated_rows integer;
begin
  update from_fed_to_chain.episode_videos video
  set lease_expires_at = now() + interval '10 minutes',
      updated_at = now()
  where video.episode_localization_id = p_episode_localization_id
    and video.status = 'processing'
    and video.lease_owner = p_lease_owner
    and video.lease_expires_at > now()
    and exists (
      select 1
      from from_fed_to_chain.episode_video_visuals visual
      where visual.episode_id = video.episode_id
        and visual.status = 'completed'
        and visual.visual_hash = video.visual_hash
        and visual.visual_version = video.visual_version
    );

  get diagnostics updated_rows = row_count;
  return updated_rows = 1;
end;
$$;


ALTER FUNCTION "from_fed_to_chain"."renew_episode_video_lease"("p_episode_localization_id" "uuid", "p_lease_owner" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "from_fed_to_chain"."renew_episode_video_visual_lease"("p_episode_id" "uuid", "p_lease_owner" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  updated_rows integer;
begin
  update from_fed_to_chain.episode_video_visuals visual
  set lease_expires_at = now() + interval '10 minutes',
      updated_at = now()
  where visual.episode_id = p_episode_id
    and visual.status = 'processing'
    and visual.lease_owner = p_lease_owner
    and visual.lease_expires_at > now();

  get diagnostics updated_rows = row_count;
  return updated_rows = 1;
end;
$$;


ALTER FUNCTION "from_fed_to_chain"."renew_episode_video_visual_lease"("p_episode_id" "uuid", "p_lease_owner" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "from_fed_to_chain"."report_episode_video_progress"("p_episode_localization_id" "uuid", "p_lease_owner" "text", "p_percent" integer, "p_stage" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  updated_rows integer;
begin
  update from_fed_to_chain.episode_videos video
  set progress_percent = greatest(
        coalesce(video.progress_percent, 0),
        least(greatest(coalesce(p_percent, 0), 0), 100)
      ),
      progress_stage = case
        when coalesce(p_percent, 0) < coalesce(video.progress_percent, 0)
          then video.progress_stage
        when p_stage in (
          'analyzing-audio',
          'aligning-script',
          'preparing-media',
          'encoding',
          'uploading-video'
        ) then p_stage
        else null
      end,
      updated_at = now()
  where video.episode_localization_id = p_episode_localization_id
    and video.status = 'processing'
    and video.lease_owner = p_lease_owner
    and video.lease_expires_at > now()
    and exists (
      select 1
      from from_fed_to_chain.episode_video_visuals visual
      where visual.episode_id = video.episode_id
        and visual.status = 'completed'
        and visual.visual_hash = video.visual_hash
        and visual.visual_version = video.visual_version
    );

  get diagnostics updated_rows = row_count;
  return updated_rows = 1;
end;
$$;


ALTER FUNCTION "from_fed_to_chain"."report_episode_video_progress"("p_episode_localization_id" "uuid", "p_lease_owner" "text", "p_percent" integer, "p_stage" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "from_fed_to_chain"."report_episode_video_visual_progress"("p_episode_id" "uuid", "p_lease_owner" "text", "p_percent" integer, "p_stage" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  updated_rows integer;
begin
  update from_fed_to_chain.episode_video_visuals visual
  set progress_percent = greatest(
        coalesce(visual.progress_percent, 0),
        least(greatest(coalesce(p_percent, 0), 0), 100)
      ),
      progress_stage = case
        -- A stale report that loses the monotonic clamp must not drag the label
        -- back either, or the client renders a percentage from one stage beside
        -- the name of an earlier one.
        when coalesce(p_percent, 0) < coalesce(visual.progress_percent, 0)
          then visual.progress_stage
        when p_stage in (
          'analyzing-audio',
          'planning-scenes',
          'selecting-images',
          'uploading-visuals'
        ) then p_stage
        else null
      end,
      updated_at = now()
  where visual.episode_id = p_episode_id
    and visual.status = 'processing'
    and visual.lease_owner = p_lease_owner
    and visual.lease_expires_at > now();

  get diagnostics updated_rows = row_count;
  return updated_rows = 1;
end;
$$;


ALTER FUNCTION "from_fed_to_chain"."report_episode_video_visual_progress"("p_episode_id" "uuid", "p_lease_owner" "text", "p_percent" integer, "p_stage" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "from_fed_to_chain"."save_episode_video_manifest"("p_episode_localization_id" "uuid", "p_lease_owner" "text", "p_manifest" "jsonb", "p_manifest_hash" "text", "p_renderer_version" "text", "p_storyboard_provider" "text", "p_storyboard_model" "text", "p_storyboard_prompt_version" "text", "p_script_hash" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  updated_rows integer;
begin
  update from_fed_to_chain.episode_videos video
  set manifest = p_manifest,
      manifest_hash = p_manifest_hash,
      renderer_version = p_renderer_version,
      storyboard_provider = p_storyboard_provider,
      storyboard_model = p_storyboard_model,
      storyboard_prompt_version = p_storyboard_prompt_version,
      script_hash = p_script_hash,
      updated_at = now()
  where video.episode_localization_id = p_episode_localization_id
    and video.status = 'processing'
    and video.lease_owner = p_lease_owner
    and video.lease_expires_at > now()
    and exists (
      select 1
      from from_fed_to_chain.episode_video_visuals visual
      where visual.episode_id = video.episode_id
        and visual.status = 'completed'
        and visual.visual_hash = video.visual_hash
        and visual.visual_version = video.visual_version
    );

  get diagnostics updated_rows = row_count;
  return updated_rows = 1;
end;
$$;


ALTER FUNCTION "from_fed_to_chain"."save_episode_video_manifest"("p_episode_localization_id" "uuid", "p_lease_owner" "text", "p_manifest" "jsonb", "p_manifest_hash" "text", "p_renderer_version" "text", "p_storyboard_provider" "text", "p_storyboard_model" "text", "p_storyboard_prompt_version" "text", "p_script_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "from_fed_to_chain"."sign_in_podcast_user"("p_email" "text" DEFAULT NULL::"text", "p_device_id" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "display_name" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select user_row.id, user_row.display_name
  from from_fed_to_chain_private.upsert_podcast_user(p_email, p_device_id) as user_row;
$$;


ALTER FUNCTION "from_fed_to_chain"."sign_in_podcast_user"("p_email" "text", "p_device_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "from_fed_to_chain_private"."refresh_language_classrooms_jsonb"("p_episode_localization_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if coalesce(cardinality(p_episode_localization_ids), 0) = 0 then
    return;
  end if;

  with target_ids as (
    select distinct input.id
    from unnest(p_episode_localization_ids) as input(id)
    where input.id is not null
  ),
  aggregated as (
    select
      lc.episode_localization_id,
      jsonb_agg(
        jsonb_build_object(
          'sourceLanguageCode', lc.source_language_code,
          'targetLanguageCode', lc.target_language_code,
          'oneLiner', lc.one_liner,
          'keywords', lc.keywords
        )
        order by lc.target_language_code
      ) as language_classrooms_jsonb
    from from_fed_to_chain.language_classrooms lc
    join target_ids target
      on target.id = lc.episode_localization_id
    group by lc.episode_localization_id
  ),
  desired as (
    select
      target.id,
      coalesce(aggregated.language_classrooms_jsonb, '[]'::jsonb)
        as language_classrooms_jsonb
    from target_ids target
    left join aggregated
      on aggregated.episode_localization_id = target.id
  )
  update from_fed_to_chain.episode_localizations localization
  set language_classrooms_jsonb = desired.language_classrooms_jsonb
  from desired
  where localization.id = desired.id
    and localization.language_classrooms_jsonb
      is distinct from desired.language_classrooms_jsonb;
end;
$$;


ALTER FUNCTION "from_fed_to_chain_private"."refresh_language_classrooms_jsonb"("p_episode_localization_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "from_fed_to_chain_private"."sync_language_classrooms_after_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  localization_ids uuid[];
begin
  select array_agg(distinct rows.episode_localization_id)
  into localization_ids
  from old_rows rows;

  perform from_fed_to_chain_private.refresh_language_classrooms_jsonb(
    localization_ids
  );
  return null;
end;
$$;


ALTER FUNCTION "from_fed_to_chain_private"."sync_language_classrooms_after_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "from_fed_to_chain_private"."sync_language_classrooms_after_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  localization_ids uuid[];
begin
  select array_agg(distinct rows.episode_localization_id)
  into localization_ids
  from new_rows rows;

  perform from_fed_to_chain_private.refresh_language_classrooms_jsonb(
    localization_ids
  );
  return null;
end;
$$;


ALTER FUNCTION "from_fed_to_chain_private"."sync_language_classrooms_after_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "from_fed_to_chain_private"."sync_language_classrooms_after_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  localization_ids uuid[];
begin
  select array_agg(distinct changed.episode_localization_id)
  into localization_ids
  from (
    select rows.episode_localization_id from old_rows rows
    union
    select rows.episode_localization_id from new_rows rows
  ) changed;

  perform from_fed_to_chain_private.refresh_language_classrooms_jsonb(
    localization_ids
  );
  return null;
end;
$$;


ALTER FUNCTION "from_fed_to_chain_private"."sync_language_classrooms_after_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "from_fed_to_chain_private"."upsert_podcast_user"("p_email" "text", "p_device_id" "text") RETURNS TABLE("id" "uuid", "display_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  normalized_email text := nullif(lower(btrim(p_email)), '');
  normalized_device_id_text text := nullif(btrim(p_device_id), '');
  normalized_device_id uuid;
  listener_name constant text := 'From Fed to Chain listener';
begin
  if (normalized_email is null) = (normalized_device_id_text is null) then
    raise exception 'Provide exactly one of p_email or p_device_id'
      using errcode = '22023';
  end if;

  if normalized_device_id_text is not null then
    if normalized_device_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'p_device_id must be UUID text'
        using errcode = '22023';
    end if;

    normalized_device_id := normalized_device_id_text::uuid;

    return query
    insert into from_fed_to_chain.users (device_id, display_name)
    values (normalized_device_id::text, listener_name)
    on conflict (device_id) do update
      set display_name = excluded.display_name
    returning users.id, users.display_name;

    return;
  end if;

  return query
  insert into from_fed_to_chain.users (email, display_name)
  values (normalized_email, listener_name)
  on conflict (email) do update
    set display_name = excluded.display_name
  returning users.id, users.display_name;
end;
$_$;


ALTER FUNCTION "from_fed_to_chain_private"."upsert_podcast_user"("p_email" "text", "p_device_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."classify_token_category"("symbol" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $_$
  SELECT
    CASE
      WHEN symbol ~~* 'btc%' OR symbol ~~* '%btc' OR symbol ~~* '%-%btc%-%' THEN 'btc'
      WHEN symbol ~~* 'eth%' OR symbol ~~* '%eth' OR symbol ~~* '%-%eth%-%' THEN 'eth'
      -- Hyperliquid HLP vault (USDC-backed)
      WHEN symbol ~* '^hlp$' THEN 'stablecoins'
      -- Standard stablecoin patterns
      WHEN symbol ~* '^(usd|usdc|usdt|dai|frax|eurc|ohm|gho|bold)'
        OR symbol ~* '(usd|usdc|usdt|dai|frax|eurc|ohm|gho|bold)$'
        OR symbol ~~* '%-%usd%-%' THEN 'stablecoins'
      ELSE 'others'
    END;
$_$;


ALTER FUNCTION "public"."classify_token_category"("symbol" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_telegram_tokens"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete tokens that are expired OR used more than 24 hours ago
  DELETE FROM telegram_verification_tokens
  WHERE expires_at < NOW()
     OR (used_at IS NOT NULL AND used_at < NOW() - INTERVAL '24 hours');

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_telegram_tokens"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cleanup_expired_telegram_tokens"() IS 'Removes expired and old used tokens. Returns count of deleted rows. Run daily via cron.';



CREATE OR REPLACE FUNCTION "public"."create_etl_job_for_wallet"("p_user_id" "uuid", "p_wallet_address" character varying, "p_job_type" character varying DEFAULT 'wallet_onboarding'::character varying, "p_ip_address" character varying DEFAULT NULL::character varying, "p_user_agent" "text" DEFAULT NULL::"text") RETURNS TABLE("job_id" "uuid", "status" character varying, "message" "text", "rate_limited" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_job_id UUID;
    v_dedup_key VARCHAR(200);
    v_recent_jobs_count INTEGER;
    v_existing_job_id UUID;
BEGIN
    -- Generate deduplication key (wallet + clock hour)
    v_dedup_key := p_wallet_address || '_' || TO_CHAR(NOW(), 'YYYY-MM-DD-HH24');

    -- Rate limiting: 2 jobs/hour per user (only protection needed)
    SELECT COUNT(*) INTO v_recent_jobs_count
    FROM alpha_raw.etl_job_queue
    WHERE user_id = p_user_id
      AND created_at > NOW() - INTERVAL '1 hour';

    IF v_recent_jobs_count >= 2 THEN
        RETURN QUERY SELECT
            NULL::UUID,
            'rate_limited'::VARCHAR(20),
            'Rate limit exceeded: Maximum 2 jobs per hour per user'::TEXT,
            TRUE;
        RETURN;
    END IF;

    -- Check for existing pending/processing job for this wallet
    SELECT q.id INTO v_existing_job_id
    FROM alpha_raw.etl_job_queue q
    WHERE q.wallet_address = p_wallet_address
      AND q.status IN ('pending', 'processing')
    LIMIT 1;

    IF v_existing_job_id IS NOT NULL THEN
        RETURN QUERY SELECT
            v_existing_job_id,
            'pending'::VARCHAR(20),
            'Job already queued'::TEXT,
            FALSE;
        RETURN;
    END IF;

    -- Deduplication: Check if data was recently fetched (tightened to 5 minutes)
    SELECT q.id INTO v_existing_job_id
    FROM alpha_raw.etl_job_queue q
    WHERE q.dedup_key = v_dedup_key
      AND q.status = 'completed'
      AND q.completed_at > NOW() - INTERVAL '5 minutes'
    LIMIT 1;

    IF v_existing_job_id IS NOT NULL THEN
        RETURN QUERY SELECT
            v_existing_job_id,
            'completed'::VARCHAR(20),
            'Data recently fetched (within 5 minutes)'::TEXT,
            FALSE;
        RETURN;
    END IF;

    -- Create new job
    INSERT INTO alpha_raw.etl_job_queue (
        job_type, user_id, wallet_address, status, priority,
        dedup_key, ip_address, user_agent
    ) VALUES (
        p_job_type, p_user_id, p_wallet_address, 'pending',
        CASE WHEN p_job_type = 'wallet_onboarding' THEN 10 ELSE 5 END,
        v_dedup_key, p_ip_address, p_user_agent
    )
    RETURNING id INTO v_job_id;

    RETURN QUERY SELECT
        v_job_id,
        'pending'::VARCHAR(20),
        'ETL job created'::TEXT,
        FALSE;
END;
$$;


ALTER FUNCTION "public"."create_etl_job_for_wallet"("p_user_id" "uuid", "p_wallet_address" character varying, "p_job_type" character varying, "p_ip_address" character varying, "p_user_agent" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_etl_job_for_wallet"("p_user_id" "uuid", "p_wallet_address" character varying, "p_job_type" character varying, "p_ip_address" character varying, "p_user_agent" "text") IS 'Creates ETL job with user-based rate limiting (2/hr per user) and 5-minute deduplication window';



CREATE OR REPLACE FUNCTION "public"."create_user_with_wallet_and_plan"("p_wallet" "text", "p_plan_code" "text" DEFAULT 'free'::"text", "p_wallet_label" "text" DEFAULT 'Main Wallet'::"text") RETURNS "json"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  DECLARE
    v_existing_user_id UUID;
    v_new_user_id UUID;
    v_result JSON;
  BEGIN
    -- Check if wallet already exists
    SELECT user_id INTO v_existing_user_id
    FROM user_crypto_wallets
    WHERE wallet = p_wallet
    LIMIT 1;

    -- If wallet exists, return existing user
    IF v_existing_user_id IS NOT NULL THEN
      v_result := json_build_object(
        'user_id', v_existing_user_id,
        'is_new_user', false
      );
      RETURN v_result;
    END IF;

    -- Create new user
    INSERT INTO users DEFAULT VALUES
    RETURNING id INTO v_new_user_id;

    -- Add wallet to user bundle
    INSERT INTO user_crypto_wallets (user_id, wallet, label)
    VALUES (v_new_user_id, p_wallet, p_wallet_label);

    -- Assign plan (with error handling to not fail entire transaction)
    BEGIN
      INSERT INTO user_subscriptions (user_id, plan_code)
      VALUES (v_new_user_id, p_plan_code);
    EXCEPTION
      WHEN OTHERS THEN
        -- Log warning but continue - plan can be assigned later
        RAISE WARNING 'Plan assignment failed for user %: %', v_new_user_id, SQLERRM;
    END;

    -- Return success result
    v_result := json_build_object(
      'user_id', v_new_user_id,
      'is_new_user', true
    );

    RETURN v_result;
  END;
  $$;


ALTER FUNCTION "public"."create_user_with_wallet_and_plan"("p_wallet" "text", "p_plan_code" "text", "p_wallet_label" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_etl_job_status"("p_job_id" "uuid") RETURNS TABLE("job_id" "uuid", "status" character varying, "created_at" timestamp with time zone, "completed_at" timestamp with time zone, "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        q.id AS job_id,
        q.status,
        q.created_at,
        q.completed_at,
        q.error_message
    FROM alpha_raw.etl_job_queue q
    WHERE q.id = p_job_id
    LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."get_etl_job_status"("p_job_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_etl_job_status"("p_job_id" "uuid") IS 'Fetch ETL job status by id without exposing alpha_raw schema';



CREATE OR REPLACE FUNCTION "public"."get_next_etl_job"() RETURNS TABLE("id" "uuid", "job_type" character varying, "user_id" "uuid", "wallet_address" character varying, "status" character varying, "retry_count" integer, "max_retries" integer)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        q.id,
        q.job_type,
        q.user_id,
        q.wallet_address,
        q.status,
        q.retry_count,
        q.max_retries
    FROM alpha_raw.etl_job_queue q
    WHERE q.status = 'pending' AND q.scheduled_at <= NOW()
    ORDER BY q.priority DESC, q.scheduled_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
END;
$$;


ALTER FUNCTION "public"."get_next_etl_job"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_next_etl_job"() IS 'Gets next pending job with row lock for concurrent-safe polling';



CREATE OR REPLACE FUNCTION "public"."get_users_wallets_by_ids"("user_ids" "text"[]) RETURNS TABLE("user_id" "text", "wallet" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id::text AS user_id,
    ucw.wallet::text AS wallet
  FROM users u
  INNER JOIN user_crypto_wallets ucw ON u.id = ucw.user_id
  WHERE
    u.id::text = ANY(user_ids)
    AND ucw.wallet IS NOT NULL
    AND ucw.wallet != ''
    AND ucw.ownership_verified_at IS NOT NULL
  ORDER BY u.id, ucw.wallet;
END;
$$;


ALTER FUNCTION "public"."get_users_wallets_by_ids"("user_ids" "text"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_users_wallets_by_ids"("user_ids" "text"[]) IS 'Returns only ownership-verified wallets for the specified users.';



CREATE OR REPLACE FUNCTION "public"."get_users_wallets_by_plan"("p_plan_code" "text") RETURNS TABLE("user_id" "uuid", "email" "text", "wallet" "text")
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    u.id AS user_id,
    u.email AS email,
    uw.wallet AS wallet
  FROM users u
  JOIN user_subscriptions us ON us.user_id = u.id
  JOIN user_crypto_wallets uw ON uw.user_id = u.id
  WHERE
    us.plan_code = p_plan_code
    AND uw.ownership_verified_at IS NOT NULL;
END;
$$;


ALTER FUNCTION "public"."get_users_wallets_by_plan"("p_plan_code" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_users_wallets_by_plan"("p_plan_code" "text") IS 'Returns only ownership-verified wallets for users with the specified plan.';



CREATE OR REPLACE FUNCTION "public"."get_users_wallets_by_plan_with_activity"("plan_name" "text") RETURNS TABLE("user_id" "text", "wallet" "text", "last_activity_at" timestamp with time zone, "last_portfolio_update_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (ucw.wallet)
    u.id::text AS user_id,
    ucw.wallet::text AS wallet,
    u.last_activity_at AS last_activity_at,
    ucw.last_portfolio_update_at AS last_portfolio_update_at
  FROM users u
  INNER JOIN user_subscriptions us ON u.id = us.user_id
  INNER JOIN plans p ON us.plan_code = p.code
  INNER JOIN user_crypto_wallets ucw ON u.id = ucw.user_id
  WHERE
    LOWER(p.code) = LOWER(plan_name)
    AND (us.is_canceled = false OR us.is_canceled IS NULL)
    AND NOW() >= us.starts_at
    AND (us.ends_at IS NULL OR NOW() <= us.ends_at)
    AND ucw.wallet IS NOT NULL
    AND ucw.wallet != ''
    AND ucw.ownership_verified_at IS NOT NULL
  ORDER BY ucw.wallet, us.starts_at DESC, u.last_activity_at DESC NULLS LAST;
END;
$$;


ALTER FUNCTION "public"."get_users_wallets_by_plan_with_activity"("plan_name" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_users_wallets_by_plan_with_activity"("plan_name" "text") IS 'Returns unique ownership-verified wallets for active users with the specified plan, prioritizing the newest subscription and most active user.';



CREATE OR REPLACE FUNCTION "public"."ledger_forbid_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RAISE EXCEPTION 'ledger tables are append-only (ADR 0002 D5): % on % is forbidden',
    TG_OP, TG_TABLE_NAME;
END;
$$;


ALTER FUNCTION "public"."ledger_forbid_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."select_one"() RETURNS integer
    LANGUAGE "sql" STABLE
    AS $$
    SELECT 1;
  $$;


ALTER FUNCTION "public"."select_one"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_email_and_upgrade_plan"("p_user_id" "uuid", "p_email" "text", "p_upgrade_plan_code" "text" DEFAULT 'vip'::"text") RETURNS "json"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  DECLARE
    v_user_exists BOOLEAN;
    v_email_in_use BOOLEAN;
    v_result JSON;
  BEGIN
    -- Check if user exists
    SELECT EXISTS(
      SELECT 1 FROM users WHERE id = p_user_id
    ) INTO v_user_exists;

    IF NOT v_user_exists THEN
      RAISE EXCEPTION 'User not found: %', p_user_id
        USING ERRCODE = 'P0002'; -- no_data_found
    END IF;

    -- Check if email is already in use by another user
    SELECT EXISTS(
      SELECT 1 FROM users
      WHERE email = p_email
      AND id != p_user_id
    ) INTO v_email_in_use;

    IF v_email_in_use THEN
      RAISE EXCEPTION 'Email already in use by another user'
        USING ERRCODE = '23505'; -- unique_violation
    END IF;

    -- Update user email and enable subscriptions
    UPDATE users
    SET
      email = p_email,
      is_subscribed_to_reports = true
    WHERE id = p_user_id;

    -- Upgrade to VIP plan (with error handling to not fail email update)
    BEGIN
      INSERT INTO user_subscriptions (user_id, plan_code)
      VALUES (p_user_id, p_upgrade_plan_code);
    EXCEPTION
      WHEN OTHERS THEN
        -- Log warning but continue - plan can be upgraded later
        RAISE WARNING 'Plan upgrade failed for user %: %', p_user_id, SQLERRM;
    END;

    -- Return success result
    v_result := json_build_object(
      'success', true,
      'message', 'Email updated successfully'
    );

    RETURN v_result;
  END;
  $$;


ALTER FUNCTION "public"."update_user_email_and_upgrade_plan"("p_user_id" "uuid", "p_email" "text", "p_upgrade_plan_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "review_web"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "review_web"."update_updated_at_column"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "analytics"."daily_wallet_tokens" (
    "user_wallet_address" "text" NOT NULL,
    "token_address" "text" NOT NULL,
    "chain" "text" NOT NULL,
    "symbol" "text",
    "amount" numeric,
    "price" numeric,
    "snapshot_date" "date" NOT NULL
);


ALTER TABLE "analytics"."daily_wallet_tokens" OWNER TO "postgres";


COMMENT ON TABLE "analytics"."daily_wallet_tokens" IS 'Canonical daily idle-wallet token balances: one row per token per wallet/UTC day, slimmed to reader-used columns. Permanent history — never add retention.';



CREATE OR REPLACE VIEW "alpha_raw"."daily_wallet_token_snapshots" WITH ("security_invoker"='true') AS
 SELECT "daily_wallet_tokens"."user_wallet_address",
    "daily_wallet_tokens"."token_address",
    "daily_wallet_tokens"."chain",
    "daily_wallet_tokens"."symbol",
    "daily_wallet_tokens"."amount",
    "daily_wallet_tokens"."price",
    true AS "is_wallet",
    "daily_wallet_tokens"."snapshot_date",
    "daily_wallet_tokens"."snapshot_date" AS "inserted_at"
   FROM "analytics"."daily_wallet_tokens";


ALTER TABLE "alpha_raw"."daily_wallet_token_snapshots" OWNER TO "postgres";


COMMENT ON VIEW "alpha_raw"."daily_wallet_token_snapshots" IS 'Stable read interface over analytics.daily_wallet_tokens.';



CREATE TABLE IF NOT EXISTS "alpha_raw"."etl_job_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_type" character varying(50) NOT NULL,
    "user_id" "uuid" NOT NULL,
    "wallet_address" character varying(42) NOT NULL,
    "status" character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    "priority" integer DEFAULT 10 NOT NULL,
    "scheduled_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "retry_count" integer DEFAULT 0 NOT NULL,
    "max_retries" integer DEFAULT 3 NOT NULL,
    "error_message" "text",
    "error_code" character varying(50),
    "ip_address" character varying(45),
    "user_agent" "text",
    "dedup_key" character varying(200) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "etl_job_queue_job_type_check" CHECK ((("job_type")::"text" = ANY ((ARRAY['wallet_onboarding'::character varying, 'wallet_refresh'::character varying])::"text"[]))),
    CONSTRAINT "etl_job_queue_status_check" CHECK ((("status")::"text" = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'completed'::character varying, 'failed'::character varying, 'rate_limited'::character varying])::"text"[])))
);


ALTER TABLE "alpha_raw"."etl_job_queue" OWNER TO "postgres";


COMMENT ON TABLE "alpha_raw"."etl_job_queue" IS 'Persistent job queue for on-the-fly ETL wallet data fetching with rate limiting';



CREATE TABLE IF NOT EXISTS "alpha_raw"."hyperliquid_vault_apr_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" DEFAULT 'hyperliquid'::"text" NOT NULL,
    "vault_address" "text" NOT NULL,
    "vault_name" "text" NOT NULL,
    "leader_address" "text" NOT NULL,
    "apr" numeric NOT NULL,
    "apr_base" numeric,
    "apr_reward" numeric,
    "tvl_usd" numeric,
    "total_followers" integer,
    "leader_commission" numeric,
    "leader_fraction" numeric,
    "is_closed" boolean DEFAULT false,
    "allow_deposits" boolean DEFAULT true,
    "pool_meta" "jsonb",
    "raw_data" "jsonb",
    "snapshot_time" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "alpha_raw"."hyperliquid_vault_apr_snapshots" OWNER TO "postgres";


COMMENT ON TABLE "alpha_raw"."hyperliquid_vault_apr_snapshots" IS 'Daily APR snapshots for Hyperliquid vault products (HLP and future vaults). Stores vault-level metrics separate from user positions in portfolio_item_snapshots.';



COMMENT ON COLUMN "alpha_raw"."hyperliquid_vault_apr_snapshots"."source" IS 'Data source identifier, default "hyperliquid" for consistency with multi-source pattern';



COMMENT ON COLUMN "alpha_raw"."hyperliquid_vault_apr_snapshots"."vault_address" IS 'Hyperliquid vault contract address (e.g., 0xdfc24b077bc1425ad1dea75bcb6f8158e10df303 for HLP)';



COMMENT ON COLUMN "alpha_raw"."hyperliquid_vault_apr_snapshots"."vault_name" IS 'Human-readable vault name (e.g., "Hyperliquidity Provider (HLP)")';



COMMENT ON COLUMN "alpha_raw"."hyperliquid_vault_apr_snapshots"."leader_address" IS 'Address of vault leader/manager who controls vault strategy';



COMMENT ON COLUMN "alpha_raw"."hyperliquid_vault_apr_snapshots"."apr" IS 'Annual Percentage Rate as decimal (e.g., 1.015 = 101.5% APR)';



COMMENT ON COLUMN "alpha_raw"."hyperliquid_vault_apr_snapshots"."apr_base" IS 'Base APR component excluding rewards (nullable, for consistency with pool_apr_snapshots)';



COMMENT ON COLUMN "alpha_raw"."hyperliquid_vault_apr_snapshots"."apr_reward" IS 'Reward/incentive APR component (nullable, for consistency with pool_apr_snapshots)';



COMMENT ON COLUMN "alpha_raw"."hyperliquid_vault_apr_snapshots"."tvl_usd" IS 'Total Value Locked in vault in USD (e.g., totalVlm from API)';



COMMENT ON COLUMN "alpha_raw"."hyperliquid_vault_apr_snapshots"."total_followers" IS 'Number of users deposited in this vault';



COMMENT ON COLUMN "alpha_raw"."hyperliquid_vault_apr_snapshots"."leader_commission" IS 'Commission rate charged by vault leader (e.g., 0.1 = 10%)';



COMMENT ON COLUMN "alpha_raw"."hyperliquid_vault_apr_snapshots"."leader_fraction" IS 'Leader ownership fraction of vault';



COMMENT ON COLUMN "alpha_raw"."hyperliquid_vault_apr_snapshots"."is_closed" IS 'Whether vault is closed/inactive';



COMMENT ON COLUMN "alpha_raw"."hyperliquid_vault_apr_snapshots"."allow_deposits" IS 'Whether vault accepts new deposits';



COMMENT ON COLUMN "alpha_raw"."hyperliquid_vault_apr_snapshots"."pool_meta" IS 'Additional vault metadata as JSONB (flexible for future fields)';



COMMENT ON COLUMN "alpha_raw"."hyperliquid_vault_apr_snapshots"."raw_data" IS 'Full API response for debugging and future field extraction';



COMMENT ON COLUMN "alpha_raw"."hyperliquid_vault_apr_snapshots"."snapshot_time" IS 'UTC timestamp when snapshot was captured';



CREATE TABLE IF NOT EXISTS "alpha_raw"."macro_fear_greed_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "snapshot_date" "date" NOT NULL,
    "score" numeric(6,2) NOT NULL,
    "label" "text" NOT NULL,
    "source" "text" DEFAULT 'cnn_fear_greed_unofficial'::"text" NOT NULL,
    "provider_updated_at" timestamp with time zone NOT NULL,
    "raw_rating" "text",
    "raw_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "macro_fear_greed_snapshots_label_check" CHECK (("label" = ANY (ARRAY['extreme_fear'::"text", 'fear'::"text", 'neutral'::"text", 'greed'::"text", 'extreme_greed'::"text"]))),
    CONSTRAINT "macro_fear_greed_snapshots_score_check" CHECK ((("score" >= (0)::numeric) AND ("score" <= (100)::numeric)))
);


ALTER TABLE "alpha_raw"."macro_fear_greed_snapshots" OWNER TO "postgres";


COMMENT ON TABLE "alpha_raw"."macro_fear_greed_snapshots" IS 'CNN US equity Fear & Greed snapshots. Kept separate from crypto sentiment_snapshots.';



COMMENT ON COLUMN "alpha_raw"."macro_fear_greed_snapshots"."snapshot_date" IS 'UTC date for the provider update timestamp.';



COMMENT ON COLUMN "alpha_raw"."macro_fear_greed_snapshots"."score" IS 'Raw CNN Fear & Greed score clamped to 0..100.';



COMMENT ON COLUMN "alpha_raw"."macro_fear_greed_snapshots"."label" IS 'Normalized label: extreme_fear, fear, neutral, greed, extreme_greed.';



COMMENT ON COLUMN "alpha_raw"."macro_fear_greed_snapshots"."source" IS 'Data source identifier. CNN endpoint is unofficial/internal.';



CREATE TABLE IF NOT EXISTS "alpha_raw"."sentiment_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sentiment_value" integer NOT NULL,
    "classification" "text" NOT NULL,
    "source" "text" DEFAULT 'alternative.me'::"text" NOT NULL,
    "snapshot_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "raw_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sentiment_snapshots_classification_check" CHECK (("classification" = ANY (ARRAY['Extreme Fear'::"text", 'Fear'::"text", 'Neutral'::"text", 'Greed'::"text", 'Extreme Greed'::"text"]))),
    CONSTRAINT "sentiment_snapshots_sentiment_value_check" CHECK ((("sentiment_value" >= 0) AND ("sentiment_value" <= 100)))
);


ALTER TABLE "alpha_raw"."sentiment_snapshots" OWNER TO "postgres";


COMMENT ON TABLE "alpha_raw"."sentiment_snapshots" IS 'Historical Fear & Greed Index snapshots collected every 10 minutes via alpha-etl ETL pipeline';



COMMENT ON COLUMN "alpha_raw"."sentiment_snapshots"."sentiment_value" IS 'Fear & Greed Index value (0-100): 0=Extreme Fear, 100=Extreme Greed';



COMMENT ON COLUMN "alpha_raw"."sentiment_snapshots"."classification" IS 'Regime classification: Extreme Fear (0-25), Fear (26-45), Neutral (46-54), Greed (55-75), Extreme Greed (76-100)';



COMMENT ON COLUMN "alpha_raw"."sentiment_snapshots"."source" IS 'Data source identifier (default: alternative.me)';



COMMENT ON COLUMN "alpha_raw"."sentiment_snapshots"."snapshot_time" IS 'Timestamp when sentiment was recorded (from API response)';



COMMENT ON COLUMN "alpha_raw"."sentiment_snapshots"."raw_data" IS 'Complete API response payload for debugging and audit trail';



CREATE TABLE IF NOT EXISTS "alpha_raw"."stock_price_dma_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "symbol" "text" NOT NULL,
    "snapshot_date" "date" NOT NULL,
    "price_usd" numeric(18,8) NOT NULL,
    "dma_200" numeric(18,8),
    "price_vs_dma_ratio" numeric(10,6),
    "is_above_dma" boolean,
    "days_available" integer NOT NULL,
    "source" "text" DEFAULT 'alphavantage'::"text" NOT NULL,
    "snapshot_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "alpha_raw"."stock_price_dma_snapshots" OWNER TO "postgres";


COMMENT ON TABLE "alpha_raw"."stock_price_dma_snapshots" IS '200-day moving average snapshots for S&P500 prices, used for regime detection';



COMMENT ON COLUMN "alpha_raw"."stock_price_dma_snapshots"."dma_200" IS '200-day simple moving average of price_usd. NULL when fewer than 200 days of data available';



COMMENT ON COLUMN "alpha_raw"."stock_price_dma_snapshots"."price_vs_dma_ratio" IS 'Ratio of current price to 200 DMA. >1.0 means price is above DMA (bullish)';



COMMENT ON COLUMN "alpha_raw"."stock_price_dma_snapshots"."is_above_dma" IS 'Boolean regime flag: true = price above 200 DMA (uptrend), false = below (downtrend)';



CREATE TABLE IF NOT EXISTS "alpha_raw"."stock_price_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "symbol" "text" NOT NULL,
    "snapshot_date" "date" NOT NULL,
    "price_usd" numeric(18,8) NOT NULL,
    "source" "text" DEFAULT 'alphavantage'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "alpha_raw"."stock_price_snapshots" OWNER TO "postgres";


COMMENT ON TABLE "alpha_raw"."stock_price_snapshots" IS 'Daily S&P500 ETF (SPY) price snapshots for portfolio rotation decisions';



COMMENT ON COLUMN "alpha_raw"."stock_price_snapshots"."symbol" IS 'Stock/ETF symbol (e.g., SPY, QQQ)';



COMMENT ON COLUMN "alpha_raw"."stock_price_snapshots"."snapshot_date" IS 'Date of snapshot (trading day, not weekend/holiday)';



COMMENT ON COLUMN "alpha_raw"."stock_price_snapshots"."price_usd" IS 'Adjusted close price in USD (adjusted for splits/dividends)';



COMMENT ON COLUMN "alpha_raw"."stock_price_snapshots"."source" IS 'Data source (alphavantage)';



CREATE TABLE IF NOT EXISTS "alpha_raw"."token_pair_ratio_dma_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "base_token_symbol" "text" NOT NULL,
    "base_token_id" "text" NOT NULL,
    "quote_token_symbol" "text" NOT NULL,
    "quote_token_id" "text" NOT NULL,
    "snapshot_date" "date" NOT NULL,
    "ratio_value" numeric(18,8) NOT NULL,
    "dma_200" numeric(18,8),
    "ratio_vs_dma_ratio" numeric(10,6),
    "is_above_dma" boolean,
    "days_available" integer NOT NULL,
    "source" "text" DEFAULT 'coingecko'::"text" NOT NULL,
    "snapshot_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "alpha_raw"."token_pair_ratio_dma_snapshots" OWNER TO "postgres";


COMMENT ON TABLE "alpha_raw"."token_pair_ratio_dma_snapshots" IS 'Pair-ratio moving average snapshots derived from token prices, used for relative-strength signals';



COMMENT ON COLUMN "alpha_raw"."token_pair_ratio_dma_snapshots"."ratio_value" IS 'Pair ratio value computed as base token price divided by quote token price';



COMMENT ON COLUMN "alpha_raw"."token_pair_ratio_dma_snapshots"."dma_200" IS '200-day simple moving average of ratio_value. NULL when fewer than 200 overlapping days are available';



COMMENT ON COLUMN "alpha_raw"."token_pair_ratio_dma_snapshots"."ratio_vs_dma_ratio" IS 'Ratio of current pair-ratio value to its 200 DMA. >1.0 means ETH/BTC is above trend';



COMMENT ON COLUMN "alpha_raw"."token_pair_ratio_dma_snapshots"."is_above_dma" IS 'Boolean relative-strength flag: true = ratio above 200 DMA, false = ratio below 200 DMA';



CREATE TABLE IF NOT EXISTS "alpha_raw"."token_price_dma_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token_symbol" "text" NOT NULL,
    "token_id" "text" NOT NULL,
    "snapshot_date" "date" NOT NULL,
    "price_usd" numeric(18,8) NOT NULL,
    "dma_200" numeric(18,8),
    "price_vs_dma_ratio" numeric(10,6),
    "is_above_dma" boolean,
    "days_available" integer NOT NULL,
    "source" "text" DEFAULT 'coingecko'::"text" NOT NULL,
    "snapshot_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "alpha_raw"."token_price_dma_snapshots" OWNER TO "postgres";


COMMENT ON TABLE "alpha_raw"."token_price_dma_snapshots" IS '200-day moving average snapshots for token prices, used as regime indicator';



COMMENT ON COLUMN "alpha_raw"."token_price_dma_snapshots"."dma_200" IS '200-day simple moving average of price_usd. NULL when fewer than 200 days of data available';



COMMENT ON COLUMN "alpha_raw"."token_price_dma_snapshots"."price_vs_dma_ratio" IS 'Ratio of current price to 200 DMA. >1.0 means price is above DMA (bullish)';



COMMENT ON COLUMN "alpha_raw"."token_price_dma_snapshots"."is_above_dma" IS 'Boolean regime flag: true = price above 200 DMA (uptrend), false = below (downtrend)';



CREATE TABLE IF NOT EXISTS "alpha_raw"."token_price_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "price_usd" numeric(18,8) NOT NULL,
    "market_cap_usd" numeric(20,2),
    "volume_24h_usd" numeric(20,2),
    "source" "text" DEFAULT 'coingecko'::"text" NOT NULL,
    "snapshot_date" "date" NOT NULL,
    "snapshot_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "raw_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "token_symbol" "text" DEFAULT 'BTC'::"text" NOT NULL,
    "token_id" "text" DEFAULT 'bitcoin'::"text" NOT NULL,
    CONSTRAINT "btc_price_snapshots_price_usd_check" CHECK (("price_usd" > (0)::numeric))
);


ALTER TABLE "alpha_raw"."token_price_snapshots" OWNER TO "postgres";


COMMENT ON TABLE "alpha_raw"."token_price_snapshots" IS 'Historical cryptocurrency price snapshots for portfolio benchmarking (BTC, ETH, SOL, etc.)';



COMMENT ON COLUMN "alpha_raw"."token_price_snapshots"."id" IS 'Unique identifier for each snapshot';



COMMENT ON COLUMN "alpha_raw"."token_price_snapshots"."price_usd" IS 'Token price in USD at snapshot time';



COMMENT ON COLUMN "alpha_raw"."token_price_snapshots"."market_cap_usd" IS 'Total BTC market capitalization in USD';



COMMENT ON COLUMN "alpha_raw"."token_price_snapshots"."volume_24h_usd" IS '24-hour trading volume in USD';



COMMENT ON COLUMN "alpha_raw"."token_price_snapshots"."source" IS 'Data source identifier (default: coingecko)';



COMMENT ON COLUMN "alpha_raw"."token_price_snapshots"."snapshot_date" IS 'Date of snapshot (midnight UTC)';



COMMENT ON COLUMN "alpha_raw"."token_price_snapshots"."snapshot_time" IS 'Exact timestamp when snapshot was recorded';



COMMENT ON COLUMN "alpha_raw"."token_price_snapshots"."raw_data" IS 'Complete API response payload for debugging and audit trail';



COMMENT ON COLUMN "alpha_raw"."token_price_snapshots"."created_at" IS 'Record creation timestamp';



COMMENT ON COLUMN "alpha_raw"."token_price_snapshots"."token_symbol" IS 'Token symbol (e.g., BTC, ETH, SOL) - uppercased';



COMMENT ON COLUMN "alpha_raw"."token_price_snapshots"."token_id" IS 'CoinGecko token ID (e.g., bitcoin, ethereum, solana)';



CREATE TABLE IF NOT EXISTS "analytics"."daily_category_trends" (
    "user_id" "uuid",
    "date" "date",
    "source_type" "text",
    "category" "text",
    "category_value_usd" numeric,
    "category_assets_usd" numeric,
    "category_debt_usd" numeric,
    "pnl_usd" numeric,
    "total_value_usd" numeric
);


ALTER TABLE "analytics"."daily_category_trends" OWNER TO "postgres";


COMMENT ON TABLE "analytics"."daily_category_trends" IS 'Canonical per-user daily category trend series derived from the daily tables by analytics.rebuild_category_trends(); pnl_usd depends on the previous day, so users are always recomputed over full history.';



CREATE TABLE IF NOT EXISTS "analytics"."daily_portfolio_positions" (
    "id" "uuid" DEFAULT "gen_random_uuid"(),
    "wallet" "text",
    "snapshot_at" timestamp with time zone,
    "snapshot_date" "date",
    "chain" "text",
    "has_supported_portfolio" boolean,
    "id_raw" "text",
    "logo_url" "text",
    "name" "text",
    "site_url" "text",
    "asset_dict" "jsonb",
    "asset_token_list" "jsonb",
    "detail" "jsonb",
    "detail_types" "text"[],
    "pool" "jsonb",
    "proxy_detail" "jsonb",
    "asset_usd_value" double precision,
    "debt_usd_value" double precision,
    "net_usd_value" double precision,
    "update_at" bigint,
    "name_item" "text",
    "source" "text" NOT NULL,
    CONSTRAINT "daily_portfolio_positions_source_check" CHECK (("source" = ANY (ARRAY['debank'::"text", 'hyperliquid'::"text"])))
);


ALTER TABLE "analytics"."daily_portfolio_positions" OWNER TO "postgres";


COMMENT ON TABLE "analytics"."daily_portfolio_positions" IS 'Canonical daily portfolio positions: every row of the day''s DeBank/Hyperliquid batch per provider/wallet/UTC day (alpha-etl replaces only that provider slice on each successful write, including empty batches). Permanent history — never add retention.';



CREATE TABLE IF NOT EXISTS "from_fed_to_chain"."episode_localizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "episode_id" "uuid" NOT NULL,
    "language_code" "text" DEFAULT 'zh-Hant'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "hls_url" "text" DEFAULT ''::"text" NOT NULL,
    "raw_text" "text",
    "script" "text",
    "llm_model" "text",
    "llm_thinking_model" "text",
    "llm_provider" "text",
    "tts_language_code" "text",
    "tts_voice_name" "text",
    "r2_prefix" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "classroom_hls_url" "text",
    "classroom_r2_prefix" "text",
    "language_classrooms_jsonb" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "episode_localizations_canonical_completed_audio_check" CHECK ((("language_code" <> 'zh-Hant'::"text") OR ("status" <> 'completed'::"text") OR ((NULLIF("btrim"("hls_url"), ''::"text") IS NOT NULL) AND (NULLIF("btrim"("classroom_hls_url"), ''::"text") IS NOT NULL)))),
    CONSTRAINT "episode_localizations_language_code_not_empty" CHECK (("btrim"("language_code") <> ''::"text")),
    CONSTRAINT "episode_localizations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'scraped'::"text", 'script_generated'::"text", 'audio_generated'::"text", 'completed'::"text"])))
);


ALTER TABLE "from_fed_to_chain"."episode_localizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "from_fed_to_chain"."episodes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_url" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "listened" boolean DEFAULT false NOT NULL,
    "source_title" "text"
);


ALTER TABLE "from_fed_to_chain"."episodes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "from_fed_to_chain"."likes" (
    "user_id" "uuid" NOT NULL,
    "episode_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "from_fed_to_chain"."likes" OWNER TO "postgres";


CREATE OR REPLACE VIEW "from_fed_to_chain"."episodes_with_stats" WITH ("security_invoker"='true') AS
 SELECT "e"."id",
    "e"."id" AS "episode_id",
    "el"."id" AS "localization_id",
    "el"."title",
    "el"."language_code",
    "el"."hls_url",
    "el"."classroom_hls_url",
    "el"."script",
    "el"."llm_model",
    "el"."llm_thinking_model",
    "el"."llm_provider",
    "el"."status",
    "e"."created_at",
    "e"."listened",
    (COALESCE("l"."like_count", (0)::bigint))::integer AS "like_count",
    "el"."language_classrooms_jsonb" AS "language_classrooms"
   FROM (("from_fed_to_chain"."episodes" "e"
     JOIN "from_fed_to_chain"."episode_localizations" "el" ON (("el"."episode_id" = "e"."id")))
     LEFT JOIN ( SELECT "likes"."episode_id",
            "count"(*) AS "like_count"
           FROM "from_fed_to_chain"."likes"
          GROUP BY "likes"."episode_id") "l" ON (("l"."episode_id" = "e"."id")))
  WHERE (("el"."status" = 'completed'::"text") AND (NULLIF("btrim"("el"."hls_url"), ''::"text") IS NOT NULL) AND (("el"."language_code" <> 'zh-Hant'::"text") OR (NULLIF("btrim"("el"."classroom_hls_url"), ''::"text") IS NOT NULL)));


ALTER TABLE "from_fed_to_chain"."episodes_with_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "from_fed_to_chain"."language_classrooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_language_code" "text" NOT NULL,
    "target_language_code" "text" NOT NULL,
    "one_liner" "text" NOT NULL,
    "keywords" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "llm_model" "text",
    "llm_thinking_model" "text",
    "llm_provider" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "episode_localization_id" "uuid" NOT NULL,
    "script" "text",
    "hls_url" "text",
    "r2_prefix" "text",
    CONSTRAINT "language_classrooms_keywords_is_array" CHECK (("jsonb_typeof"("keywords") = 'array'::"text")),
    CONSTRAINT "language_classrooms_language_codes_not_empty" CHECK ((("btrim"("source_language_code") <> ''::"text") AND ("btrim"("target_language_code") <> ''::"text")))
);


ALTER TABLE "from_fed_to_chain"."language_classrooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ops"."cost_rates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "metric_key" "text" NOT NULL,
    "unit" "text" NOT NULL,
    "price_usd" numeric(18,8) NOT NULL,
    "effective_from" timestamp with time zone NOT NULL,
    "effective_to" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "note" "text",
    CONSTRAINT "cost_rates_effective_window_check" CHECK ((("effective_to" IS NULL) OR ("effective_to" > "effective_from"))),
    CONSTRAINT "cost_rates_price_usd_check" CHECK (("price_usd" >= (0)::numeric)),
    CONSTRAINT "cost_rates_provider_check" CHECK (("provider" = ANY (ARRAY['debank'::"text", 'openrouter'::"text", 'supabase'::"text", 'fly'::"text"])))
);


ALTER TABLE "ops"."cost_rates" OWNER TO "postgres";


CREATE OR REPLACE VIEW "from_fed_to_chain"."ops_cost_rates" WITH ("security_invoker"='true') AS
 SELECT "cost_rates"."id",
    "cost_rates"."provider",
    "cost_rates"."metric_key",
    "cost_rates"."unit",
    "cost_rates"."price_usd",
    "cost_rates"."effective_from",
    "cost_rates"."effective_to"
   FROM "ops"."cost_rates";


ALTER TABLE "from_fed_to_chain"."ops_cost_rates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ops"."cost_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "snapshot_date" "date" NOT NULL,
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "accrued_cost_usd" numeric(18,8),
    "projected_cost_usd" numeric(18,8),
    "cost_type" "text" NOT NULL,
    "source" "text" NOT NULL,
    "usage" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "pricing_rate_id" "uuid",
    "fetched_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cost_snapshots_cost_type_check" CHECK (("cost_type" = ANY (ARRAY['actual'::"text", 'estimated'::"text", 'fixed'::"text", 'list-price-equivalent'::"text"]))),
    CONSTRAINT "cost_snapshots_period_check" CHECK (("period_end" >= "period_start")),
    CONSTRAINT "cost_snapshots_provider_check" CHECK (("provider" = ANY (ARRAY['debank'::"text", 'openrouter'::"text", 'supabase'::"text", 'fly'::"text"]))),
    CONSTRAINT "cost_snapshots_source_check" CHECK (("source" = ANY (ARRAY['api'::"text", 'fixed'::"text", 'manual'::"text"]))),
    CONSTRAINT "cost_snapshots_usage_is_array" CHECK (("jsonb_typeof"("usage") = 'array'::"text"))
);


ALTER TABLE "ops"."cost_snapshots" OWNER TO "postgres";


CREATE OR REPLACE VIEW "from_fed_to_chain"."ops_cost_snapshots" WITH ("security_invoker"='true') AS
 SELECT "cost_snapshots"."provider",
    "cost_snapshots"."snapshot_date",
    "cost_snapshots"."period_start",
    "cost_snapshots"."period_end",
    "cost_snapshots"."accrued_cost_usd",
    "cost_snapshots"."projected_cost_usd",
    "cost_snapshots"."cost_type",
    "cost_snapshots"."source",
    "cost_snapshots"."usage",
    "cost_snapshots"."pricing_rate_id",
    "cost_snapshots"."fetched_at"
   FROM "ops"."cost_snapshots";


ALTER TABLE "from_fed_to_chain"."ops_cost_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "ops"."cost_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "amount_usd" numeric(18,8) NOT NULL,
    "charged_at" timestamp with time zone NOT NULL,
    "kind" "text" NOT NULL,
    "source" "text" NOT NULL,
    "external_id" "text",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cost_transactions_amount_usd_check" CHECK (("amount_usd" >= (0)::numeric)),
    CONSTRAINT "cost_transactions_kind_check" CHECK (("kind" = ANY (ARRAY['subscription'::"text", 'top_up'::"text", 'invoice'::"text", 'adjustment'::"text"]))),
    CONSTRAINT "cost_transactions_provider_check" CHECK (("provider" = ANY (ARRAY['debank'::"text", 'openrouter'::"text", 'supabase'::"text", 'fly'::"text"])))
);


ALTER TABLE "ops"."cost_transactions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "from_fed_to_chain"."ops_cost_transactions" WITH ("security_invoker"='true') AS
 SELECT "cost_transactions"."amount_usd",
    "cost_transactions"."charged_at"
   FROM "ops"."cost_transactions";


ALTER TABLE "from_fed_to_chain"."ops_cost_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "from_fed_to_chain"."social_account_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "platform" "text" NOT NULL,
    "captured_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "followers" integer NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "social_account_snapshots_details_is_object" CHECK (("jsonb_typeof"("details") = 'object'::"text")),
    CONSTRAINT "social_account_snapshots_followers_check" CHECK (("followers" >= 0)),
    CONSTRAINT "social_account_snapshots_platform_check" CHECK (("platform" = ANY (ARRAY['x'::"text", 'threads'::"text", 'rednote'::"text", 'youtube'::"text"])))
);


ALTER TABLE "from_fed_to_chain"."social_account_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "from_fed_to_chain"."social_daemon_state" (
    "id" "text" NOT NULL,
    "first_started_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "social_daemon_state_id_not_blank" CHECK ((NULLIF("btrim"("id"), ''::"text") IS NOT NULL))
);


ALTER TABLE "from_fed_to_chain"."social_daemon_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "from_fed_to_chain"."social_post_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "social_post_id" "uuid" NOT NULL,
    "captured_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "age_hours" numeric NOT NULL,
    "views" integer,
    "impressions" integer,
    "likes" integer,
    "comments" integer,
    "shares" integer,
    "saves" integer,
    "profile_visits" integer,
    "followers_gained" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "measurement_window" "text",
    CONSTRAINT "social_post_metrics_age_hours_check" CHECK (("age_hours" >= (0)::numeric)),
    CONSTRAINT "social_post_metrics_comments_check" CHECK (("comments" >= 0)),
    CONSTRAINT "social_post_metrics_details_is_object" CHECK (("jsonb_typeof"("details") = 'object'::"text")),
    CONSTRAINT "social_post_metrics_impressions_check" CHECK (("impressions" >= 0)),
    CONSTRAINT "social_post_metrics_likes_check" CHECK (("likes" >= 0)),
    CONSTRAINT "social_post_metrics_measurement_window_check" CHECK ((("measurement_window" IS NULL) OR ("measurement_window" = ANY (ARRAY['1h'::"text", '6h'::"text", '24h'::"text", '72h'::"text", '7d'::"text"])))),
    CONSTRAINT "social_post_metrics_profile_visits_check" CHECK (("profile_visits" >= 0)),
    CONSTRAINT "social_post_metrics_saves_check" CHECK (("saves" >= 0)),
    CONSTRAINT "social_post_metrics_shares_check" CHECK (("shares" >= 0)),
    CONSTRAINT "social_post_metrics_views_check" CHECK (("views" >= 0))
);


ALTER TABLE "from_fed_to_chain"."social_post_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "from_fed_to_chain"."social_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "episode_id" "uuid" NOT NULL,
    "platform" "text" NOT NULL,
    "post_url" "text",
    "platform_post_id" "text",
    "published_at" timestamp with time zone NOT NULL,
    "topic" "text" NOT NULL,
    "hook_type" "text" NOT NULL,
    "generated_title" "text",
    "published_title" "text",
    "generated_body" "text" NOT NULL,
    "published_body" "text" NOT NULL,
    "hashtags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "video_duration_sec" double precision,
    "content_features" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "llm_model" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "review_status" "text",
    CONSTRAINT "social_posts_features_is_object" CHECK (("jsonb_typeof"("content_features") = 'object'::"text")),
    CONSTRAINT "social_posts_generated_body_check" CHECK ((NULLIF("btrim"("generated_body"), ''::"text") IS NOT NULL)),
    CONSTRAINT "social_posts_hashtags_match_platform" CHECK ((("platform" = 'rednote'::"text") OR ("hashtags" = '{}'::"text"[]))),
    CONSTRAINT "social_posts_hook_type_check" CHECK ((NULLIF("btrim"("hook_type"), ''::"text") IS NOT NULL)),
    CONSTRAINT "social_posts_platform_check" CHECK (("platform" = ANY (ARRAY['x'::"text", 'threads'::"text", 'rednote'::"text", 'youtube'::"text"]))),
    CONSTRAINT "social_posts_platform_post_id_not_blank" CHECK ((("platform_post_id" IS NULL) OR ("btrim"("platform_post_id") <> ''::"text"))),
    CONSTRAINT "social_posts_post_url_not_blank" CHECK ((("post_url" IS NULL) OR ("btrim"("post_url") <> ''::"text"))),
    CONSTRAINT "social_posts_published_body_check" CHECK ((NULLIF("btrim"("published_body"), ''::"text") IS NOT NULL)),
    CONSTRAINT "social_posts_review_status_check" CHECK ((("review_status" IS NULL) OR ("review_status" = ANY (ARRAY['visible'::"text", 'under_review'::"text", 'rejected'::"text", 'self_only'::"text"])))),
    CONSTRAINT "social_posts_title_matches_platform" CHECK (((("platform" = ANY (ARRAY['rednote'::"text", 'youtube'::"text"])) AND (NULLIF("btrim"("generated_title"), ''::"text") IS NOT NULL) AND (NULLIF("btrim"("published_title"), ''::"text") IS NOT NULL)) OR (("platform" <> ALL (ARRAY['rednote'::"text", 'youtube'::"text"])) AND ("generated_title" IS NULL) AND ("published_title" IS NULL)))),
    CONSTRAINT "social_posts_topic_check" CHECK ((NULLIF("btrim"("topic"), ''::"text") IS NOT NULL)),
    CONSTRAINT "social_posts_video_matches_platform" CHECK (((("platform" = ANY (ARRAY['rednote'::"text", 'youtube'::"text"])) AND ("video_duration_sec" IS NOT NULL) AND ("video_duration_sec" > (0)::double precision)) OR (("platform" <> ALL (ARRAY['rednote'::"text", 'youtube'::"text"])) AND (("video_duration_sec" IS NULL) OR ("video_duration_sec" > (0)::double precision)))))
);


ALTER TABLE "from_fed_to_chain"."social_posts" OWNER TO "postgres";


CREATE OR REPLACE VIEW "from_fed_to_chain"."social_publish_candidates" AS
 SELECT "video"."episode_id",
    COALESCE("video"."completed_at", "video"."updated_at", "video"."created_at") AS "ready_at"
   FROM ("from_fed_to_chain"."episode_videos" "video"
     JOIN "from_fed_to_chain"."episode_localizations" "localization" ON (("localization"."id" = "video"."episode_localization_id")))
  WHERE (("localization"."language_code" = 'zh-Hant'::"text") AND ("localization"."status" = 'completed'::"text") AND ("video"."status" = 'completed'::"text") AND (NULLIF("btrim"("video"."mp4_url"), ''::"text") IS NOT NULL) AND (NULLIF("btrim"("video"."thumbnail_url"), ''::"text") IS NOT NULL) AND ("video"."duration_seconds" IS NOT NULL) AND ("video"."duration_seconds" > (0)::double precision));


ALTER TABLE "from_fed_to_chain"."social_publish_candidates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "from_fed_to_chain"."social_strategy_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "platform" "text" NOT NULL,
    "version" integer NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "based_on_samples" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT false NOT NULL,
    "activated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "social_strategy_versions_active_has_timestamp" CHECK (((NOT "active") OR ("activated_at" IS NOT NULL))),
    CONSTRAINT "social_strategy_versions_based_on_samples_check" CHECK (("based_on_samples" >= 0)),
    CONSTRAINT "social_strategy_versions_config_is_object" CHECK (("jsonb_typeof"("config") = 'object'::"text")),
    CONSTRAINT "social_strategy_versions_platform_check" CHECK (("platform" = ANY (ARRAY['x'::"text", 'threads'::"text", 'rednote'::"text", 'youtube'::"text"]))),
    CONSTRAINT "social_strategy_versions_version_check" CHECK (("version" > 0))
);


ALTER TABLE "from_fed_to_chain"."social_strategy_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "from_fed_to_chain"."user_episode_state" (
    "user_id" "uuid" NOT NULL,
    "episode_id" "uuid" NOT NULL,
    "listened" boolean DEFAULT false,
    "last_position_seconds" integer DEFAULT 0,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "from_fed_to_chain"."user_episode_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "from_fed_to_chain"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text",
    "device_id" "text",
    "display_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "from_fed_to_chain"."users" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."daily_portfolio_snapshots" WITH ("security_invoker"='true') AS
 SELECT "daily_portfolio_positions"."id",
    "daily_portfolio_positions"."wallet",
    "daily_portfolio_positions"."snapshot_at",
    "daily_portfolio_positions"."snapshot_date",
    "daily_portfolio_positions"."chain",
    "daily_portfolio_positions"."has_supported_portfolio",
    "daily_portfolio_positions"."id_raw",
    "daily_portfolio_positions"."logo_url",
    "daily_portfolio_positions"."name",
    "daily_portfolio_positions"."site_url",
    "daily_portfolio_positions"."asset_dict",
    "daily_portfolio_positions"."asset_token_list",
    "daily_portfolio_positions"."detail",
    "daily_portfolio_positions"."detail_types",
    "daily_portfolio_positions"."pool",
    "daily_portfolio_positions"."proxy_detail",
    "daily_portfolio_positions"."asset_usd_value",
    "daily_portfolio_positions"."debt_usd_value",
    "daily_portfolio_positions"."net_usd_value",
    "daily_portfolio_positions"."update_at",
    "daily_portfolio_positions"."name_item"
   FROM "analytics"."daily_portfolio_positions";


ALTER TABLE "public"."daily_portfolio_snapshots" OWNER TO "postgres";


COMMENT ON VIEW "public"."daily_portfolio_snapshots" IS 'Stable read interface over analytics.daily_portfolio_positions.';



CREATE TABLE IF NOT EXISTS "public"."job_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "level" "public"."log_level" NOT NULL,
    "message" "text" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."job_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "public"."job_type" NOT NULL,
    "status" "public"."job_status" DEFAULT 'pending'::"public"."job_status" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "priority" integer DEFAULT 0 NOT NULL,
    "max_retries" integer DEFAULT 3 NOT NULL,
    "retry_count" integer DEFAULT 0 NOT NULL,
    "retry_delay_seconds" integer DEFAULT 60 NOT NULL,
    "scheduled_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ledger_decision_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "strategy_version" "text" NOT NULL,
    "config_identity" "text" NOT NULL,
    "decision_type" "text" NOT NULL,
    "signal_event_id" "uuid",
    "user_id" "uuid",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "inserted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."ledger_decision_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."ledger_decision_events" IS 'Append-only: strategy decisions. strategy_version + config_identity close the implicit-versioning gap (ADR 0002 D5).';



CREATE TABLE IF NOT EXISTS "public"."ledger_execution_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status" "text" NOT NULL,
    "plan_event_id" "uuid",
    "user_id" "uuid",
    "chain_id" integer,
    "tx_hash" "text",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "inserted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "ledger_execution_events_status_check" CHECK (("status" = ANY (ARRAY['submitted'::"text", 'confirmed'::"text", 'failed'::"text", 'replaced'::"text"])))
);


ALTER TABLE "public"."ledger_execution_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."ledger_execution_events" IS 'Append-only: per-leg execution outcomes. Doubles as the L3 journal (ADR 0001) and the resumable leg-state store (ADR 0002 A6).';



CREATE TABLE IF NOT EXISTS "public"."ledger_plan_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_kind" "text" NOT NULL,
    "decision_event_id" "uuid",
    "user_id" "uuid",
    "plan_hash" "text",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "inserted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "ledger_plan_events_plan_kind_check" CHECK (("plan_kind" = ANY (ARRAY['deposit'::"text", 'withdraw'::"text", 'rebalance'::"text"])))
);


ALTER TABLE "public"."ledger_plan_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."ledger_plan_events" IS 'Append-only: composed execution plans. plan_hash is nullable until ADR 0001 D4 plan-integrity primitives land.';



CREATE TABLE IF NOT EXISTS "public"."ledger_signal_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" NOT NULL,
    "signal_type" "text" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "inserted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."ledger_signal_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."ledger_signal_events" IS 'Append-only: strategy inputs (regime state, daily suggestion) as observed. Source of truth for the decision chain (ADR 0002 D5).';



CREATE TABLE IF NOT EXISTS "public"."notification_settings" (
    "user_id" "uuid" NOT NULL,
    "channel_type" "text" NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "valid_channel_types" CHECK (("channel_type" = ANY (ARRAY['email'::"text", 'telegram'::"text", 'webhook'::"text"])))
);


ALTER TABLE "public"."notification_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."notification_settings" IS 'Multi-channel notification configuration. Supports telegram, email, and webhook channels.';



COMMENT ON COLUMN "public"."notification_settings"."config" IS 'Channel-specific configuration. For telegram: {"chat_id": "123456789", "rebalance_threshold": 0.05}';



CREATE TABLE IF NOT EXISTS "public"."plans" (
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "tier" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."plans" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."portfolio_category_trend_mv" WITH ("security_invoker"='true') AS
 SELECT "daily_category_trends"."user_id",
    "daily_category_trends"."date",
    "daily_category_trends"."source_type",
    "daily_category_trends"."category",
    "daily_category_trends"."category_value_usd",
    "daily_category_trends"."category_assets_usd",
    "daily_category_trends"."category_debt_usd",
    "daily_category_trends"."pnl_usd",
    "daily_category_trends"."total_value_usd"
   FROM "analytics"."daily_category_trends";


ALTER TABLE "public"."portfolio_category_trend_mv" OWNER TO "postgres";


COMMENT ON VIEW "public"."portfolio_category_trend_mv" IS 'Stable read interface over analytics.daily_category_trends.';



CREATE OR REPLACE VIEW "public"."regime_transitions_view" AS
 WITH "ordered_snapshots" AS (
         SELECT "sentiment_snapshots"."id",
            "sentiment_snapshots"."sentiment_value",
            "sentiment_snapshots"."classification",
            "sentiment_snapshots"."snapshot_time" AS "transitioned_at",
            "sentiment_snapshots"."source",
            "lag"("sentiment_snapshots"."classification") OVER (ORDER BY "sentiment_snapshots"."snapshot_time") AS "prev_classification"
           FROM "alpha_raw"."sentiment_snapshots"
        ), "transitions" AS (
         SELECT "ordered_snapshots"."id",
            "ordered_snapshots"."classification" AS "to_regime_label",
            "ordered_snapshots"."prev_classification" AS "from_regime_label",
            "ordered_snapshots"."sentiment_value",
            "ordered_snapshots"."transitioned_at",
            "ordered_snapshots"."source"
           FROM "ordered_snapshots"
          WHERE (("ordered_snapshots"."classification" <> "ordered_snapshots"."prev_classification") OR ("ordered_snapshots"."prev_classification" IS NULL))
        ), "mapped_transitions" AS (
         SELECT "transitions"."id",
            (
                CASE "transitions"."to_regime_label"
                    WHEN 'Extreme Fear'::"text" THEN 'ef'::"text"
                    WHEN 'Fear'::"text" THEN 'f'::"text"
                    WHEN 'Neutral'::"text" THEN 'n'::"text"
                    WHEN 'Greed'::"text" THEN 'g'::"text"
                    WHEN 'Extreme Greed'::"text" THEN 'eg'::"text"
                    ELSE NULL::"text"
                END)::"public"."regime_id" AS "to_regime",
            (
                CASE "transitions"."from_regime_label"
                    WHEN 'Extreme Fear'::"text" THEN 'ef'::"text"
                    WHEN 'Fear'::"text" THEN 'f'::"text"
                    WHEN 'Neutral'::"text" THEN 'n'::"text"
                    WHEN 'Greed'::"text" THEN 'g'::"text"
                    WHEN 'Extreme Greed'::"text" THEN 'eg'::"text"
                    ELSE NULL::"text"
                END)::"public"."regime_id" AS "from_regime",
            "transitions"."sentiment_value",
            "transitions"."transitioned_at",
            "transitions"."source"
           FROM "transitions"
        )
 SELECT "mapped_transitions"."id",
    "mapped_transitions"."to_regime",
    "mapped_transitions"."from_regime",
    "mapped_transitions"."sentiment_value",
    "mapped_transitions"."transitioned_at",
    "mapped_transitions"."source"
   FROM "mapped_transitions";


ALTER TABLE "public"."regime_transitions_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."strategy_change_notification_state" (
    "strategy_id" "text" NOT NULL,
    "last_event_date" "date" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."strategy_change_notification_state" OWNER TO "postgres";


COMMENT ON TABLE "public"."strategy_change_notification_state" IS 'Last equity-curve trade-event date already announced on Telegram, per strategy.';



COMMENT ON COLUMN "public"."strategy_change_notification_state"."last_event_date" IS 'Events on or before this date are already announced; only later events notify.';



CREATE TABLE IF NOT EXISTS "public"."strategy_saved_configs" (
    "config_id" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "description" "text",
    "strategy_id" "text" NOT NULL,
    "primary_asset" "text" NOT NULL,
    "params" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "composition" "jsonb" NOT NULL,
    "supports_daily_suggestion" boolean DEFAULT false NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "is_benchmark" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."strategy_saved_configs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."strategy_trade_history" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "trade_date" "date" NOT NULL,
    "strategy_id" "text",
    "config_id" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE "public"."strategy_trade_history" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."strategy_trade_history_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."strategy_trade_history_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."strategy_trade_history_id_seq" OWNED BY "public"."strategy_trade_history"."id";



CREATE TABLE IF NOT EXISTS "public"."telegram_verification_tokens" (
    "token" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "used_at" timestamp with time zone,
    CONSTRAINT "expires_in_future" CHECK (("expires_at" > "created_at")),
    CONSTRAINT "token_not_empty" CHECK (("char_length"("token") > 0))
);


ALTER TABLE "public"."telegram_verification_tokens" OWNER TO "postgres";


COMMENT ON TABLE "public"."telegram_verification_tokens" IS 'Temporary tokens for secure Telegram connection. Expire after 10 minutes, single-use.';



COMMENT ON COLUMN "public"."telegram_verification_tokens"."used_at" IS 'Timestamp when token was consumed. NULL = unused. Set when user completes connection.';



CREATE TABLE IF NOT EXISTS "public"."user_crypto_wallets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "wallet" "text" NOT NULL,
    "label" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_portfolio_update_at" timestamp with time zone,
    "ownership_verified_at" timestamp with time zone
);


ALTER TABLE "public"."user_crypto_wallets" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_crypto_wallets"."last_portfolio_update_at" IS 'Timestamp of last portfolio data update from DeBank API. Updated by alpha-etl after successful fetch.';



COMMENT ON COLUMN "public"."user_crypto_wallets"."ownership_verified_at" IS 'Set when the binding presented a valid challenge signature proving control of the wallet key (ADR 0002 A1). NULL = unverified / observe-only binding.';



CREATE TABLE IF NOT EXISTS "public"."user_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_code" "text" NOT NULL,
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ends_at" timestamp with time zone,
    "is_canceled" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_subscribed_to_reports" boolean DEFAULT true NOT NULL,
    "last_activity_at" timestamp with time zone,
    "telegram_username" "text"
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."users"."is_subscribed_to_reports" IS 'Controls whether user receives weekly email reports. Does not affect transactional emails.';



COMMENT ON COLUMN "public"."users"."last_activity_at" IS 'Primary activity tracking field. Timestamp of last user activity (dashboard visit, API request, etc.).
Updated by account-engine with 1-hour debouncing. Replaces deprecated is_active boolean.
Used by alpha-etl via get_users_wallets_by_plan_with_activity() to determine which users to update.';



COMMENT ON COLUMN "public"."users"."telegram_username" IS 'Telegram username (@handle) for audit purposes. Stored when user connects Telegram.';



CREATE TABLE IF NOT EXISTS "review_web"."content" (
    "id" "text" NOT NULL,
    "language" "text" NOT NULL,
    "category" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "date" "date" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "references" "jsonb" DEFAULT '[]'::"jsonb",
    "framework" "text",
    "audio_file" "text",
    "social_hook" "text",
    "knowledge_concepts_used" "jsonb" DEFAULT '[]'::"jsonb",
    "feedback" "jsonb" DEFAULT '{}'::"jsonb",
    "streaming_urls" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "content_category_check" CHECK (("category" = ANY (ARRAY['daily-news'::"text", 'ethereum'::"text", 'macro'::"text", 'startup'::"text", 'ai'::"text", 'defi'::"text"]))),
    CONSTRAINT "content_language_check" CHECK (("language" = ANY (ARRAY['zh-TW'::"text", 'en-US'::"text", 'ja-JP'::"text"]))),
    CONSTRAINT "content_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'reviewed'::"text", 'translated'::"text", 'wav'::"text", 'm3u8'::"text", 'cloudflare'::"text", 'content'::"text", 'social'::"text"])))
);


ALTER TABLE "review_web"."content" OWNER TO "postgres";


COMMENT ON TABLE "review_web"."content" IS 'Consolidated content storage. Review data migrated from deprecated content_status table on 2025-12-16. Pipeline status tracked in status field: draft→reviewed→translated→wav→m3u8→cloudflare→content→social.';



COMMENT ON COLUMN "review_web"."content"."id" IS 'Content identifier (e.g., 2025-12-13-article-title)';



COMMENT ON COLUMN "review_web"."content"."language" IS 'Content language: zh-TW (source), en-US, ja-JP';



COMMENT ON COLUMN "review_web"."content"."category" IS 'Content category';



COMMENT ON COLUMN "review_web"."content"."status" IS 'Pipeline status';



COMMENT ON COLUMN "review_web"."content"."content" IS 'Full markdown content';



COMMENT ON COLUMN "review_web"."content"."references" IS 'Array of source URLs';



COMMENT ON COLUMN "review_web"."content"."feedback" IS 'Review feedback object';



COMMENT ON COLUMN "review_web"."content"."streaming_urls" IS 'Cloudflare R2 streaming URLs';



CREATE TABLE IF NOT EXISTS "review_web"."pipeline_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content_id" "text" NOT NULL,
    "job_type" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "error_message" "text",
    "github_run_id" "text",
    "github_run_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "review_web"."pipeline_jobs" OWNER TO "postgres";


ALTER TABLE ONLY "public"."strategy_trade_history" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."strategy_trade_history_id_seq"'::"regclass");



ALTER TABLE ONLY "alpha_raw"."token_price_snapshots"
    ADD CONSTRAINT "btc_price_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "alpha_raw"."etl_job_queue"
    ADD CONSTRAINT "etl_job_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "alpha_raw"."hyperliquid_vault_apr_snapshots"
    ADD CONSTRAINT "hyperliquid_vault_apr_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "alpha_raw"."macro_fear_greed_snapshots"
    ADD CONSTRAINT "macro_fear_greed_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "alpha_raw"."sentiment_snapshots"
    ADD CONSTRAINT "sentiment_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "alpha_raw"."stock_price_dma_snapshots"
    ADD CONSTRAINT "stock_price_dma_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "alpha_raw"."stock_price_snapshots"
    ADD CONSTRAINT "stock_price_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "alpha_raw"."token_pair_ratio_dma_snapshots"
    ADD CONSTRAINT "token_pair_ratio_dma_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "alpha_raw"."token_price_dma_snapshots"
    ADD CONSTRAINT "token_price_dma_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "alpha_raw"."hyperliquid_vault_apr_snapshots"
    ADD CONSTRAINT "unique_vault_snapshot" UNIQUE ("vault_address", "snapshot_time");



ALTER TABLE ONLY "analytics"."daily_wallet_tokens"
    ADD CONSTRAINT "daily_wallet_tokens_pkey" PRIMARY KEY ("user_wallet_address", "token_address", "chain", "snapshot_date");



ALTER TABLE ONLY "from_fed_to_chain"."episode_localizations"
    ADD CONSTRAINT "episode_localizations_episode_language_key" UNIQUE ("episode_id", "language_code");



ALTER TABLE ONLY "from_fed_to_chain"."episode_localizations"
    ADD CONSTRAINT "episode_localizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "from_fed_to_chain"."episode_video_visuals"
    ADD CONSTRAINT "episode_video_visuals_checkpoint_key" UNIQUE ("episode_id", "visual_hash", "visual_version");



ALTER TABLE ONLY "from_fed_to_chain"."episode_video_visuals"
    ADD CONSTRAINT "episode_video_visuals_pkey" PRIMARY KEY ("episode_id");



ALTER TABLE ONLY "from_fed_to_chain"."episode_videos"
    ADD CONSTRAINT "episode_videos_pkey" PRIMARY KEY ("episode_localization_id");



ALTER TABLE ONLY "from_fed_to_chain"."episodes"
    ADD CONSTRAINT "episodes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "from_fed_to_chain"."language_classrooms"
    ADD CONSTRAINT "language_classrooms_localization_target_language_key" UNIQUE ("episode_localization_id", "target_language_code");



ALTER TABLE ONLY "from_fed_to_chain"."language_classrooms"
    ADD CONSTRAINT "language_classrooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "from_fed_to_chain"."likes"
    ADD CONSTRAINT "likes_pkey" PRIMARY KEY ("user_id", "episode_id");



ALTER TABLE ONLY "from_fed_to_chain"."social_account_snapshots"
    ADD CONSTRAINT "social_account_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "from_fed_to_chain"."social_daemon_state"
    ADD CONSTRAINT "social_daemon_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "from_fed_to_chain"."social_post_metrics"
    ADD CONSTRAINT "social_post_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "from_fed_to_chain"."social_posts"
    ADD CONSTRAINT "social_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "from_fed_to_chain"."social_publish_jobs"
    ADD CONSTRAINT "social_publish_jobs_episode_id_platform_key" UNIQUE ("episode_id", "platform");



ALTER TABLE ONLY "from_fed_to_chain"."social_publish_jobs"
    ADD CONSTRAINT "social_publish_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "from_fed_to_chain"."social_strategy_versions"
    ADD CONSTRAINT "social_strategy_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "from_fed_to_chain"."social_strategy_versions"
    ADD CONSTRAINT "social_strategy_versions_platform_version_key" UNIQUE ("platform", "version");



ALTER TABLE ONLY "from_fed_to_chain"."user_episode_state"
    ADD CONSTRAINT "user_episode_state_pkey" PRIMARY KEY ("user_id", "episode_id");



ALTER TABLE ONLY "from_fed_to_chain"."users"
    ADD CONSTRAINT "users_device_id_key" UNIQUE ("device_id");



ALTER TABLE ONLY "from_fed_to_chain"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "from_fed_to_chain"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ops"."cost_rates"
    ADD CONSTRAINT "cost_rates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ops"."cost_rates"
    ADD CONSTRAINT "cost_rates_version_unique" UNIQUE ("provider", "metric_key", "effective_from");



ALTER TABLE ONLY "ops"."cost_snapshots"
    ADD CONSTRAINT "cost_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "ops"."cost_snapshots"
    ADD CONSTRAINT "cost_snapshots_provider_date_unique" UNIQUE ("provider", "snapshot_date");



ALTER TABLE ONLY "ops"."cost_transactions"
    ADD CONSTRAINT "cost_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_logs"
    ADD CONSTRAINT "job_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ledger_decision_events"
    ADD CONSTRAINT "ledger_decision_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ledger_execution_events"
    ADD CONSTRAINT "ledger_execution_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ledger_plan_events"
    ADD CONSTRAINT "ledger_plan_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ledger_signal_events"
    ADD CONSTRAINT "ledger_signal_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_settings"
    ADD CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("user_id", "channel_type");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."strategy_change_notification_state"
    ADD CONSTRAINT "strategy_change_notification_state_pkey" PRIMARY KEY ("strategy_id");



ALTER TABLE ONLY "public"."strategy_saved_configs"
    ADD CONSTRAINT "strategy_saved_configs_pkey" PRIMARY KEY ("config_id");



ALTER TABLE ONLY "public"."strategy_trade_history"
    ADD CONSTRAINT "strategy_trade_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."telegram_verification_tokens"
    ADD CONSTRAINT "telegram_verification_tokens_pkey" PRIMARY KEY ("token");



ALTER TABLE ONLY "public"."user_crypto_wallets"
    ADD CONSTRAINT "unique_wallet_address" UNIQUE ("wallet");



ALTER TABLE ONLY "public"."user_crypto_wallets"
    ADD CONSTRAINT "user_crypto_wallets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_crypto_wallets"
    ADD CONSTRAINT "user_wallets_user_wallet_uniq" UNIQUE ("user_id", "wallet");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "review_web"."content"
    ADD CONSTRAINT "content_pkey" PRIMARY KEY ("id", "language");



ALTER TABLE ONLY "review_web"."pipeline_jobs"
    ADD CONSTRAINT "pipeline_jobs_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_btc_price_snapshots_source_date" ON "alpha_raw"."token_price_snapshots" USING "btree" ("source", "snapshot_date");



CREATE INDEX "idx_etl_jobs_dedup" ON "alpha_raw"."etl_job_queue" USING "btree" ("dedup_key", "created_at" DESC);



CREATE INDEX "idx_etl_jobs_ip_rate_limit" ON "alpha_raw"."etl_job_queue" USING "btree" ("ip_address", "created_at" DESC);



CREATE INDEX "idx_etl_jobs_pending" ON "alpha_raw"."etl_job_queue" USING "btree" ("status", "priority" DESC, "scheduled_at") WHERE (("status")::"text" = 'pending'::"text");



CREATE UNIQUE INDEX "idx_etl_jobs_unique_pending_wallet" ON "alpha_raw"."etl_job_queue" USING "btree" ("wallet_address") WHERE (("status")::"text" = ANY ((ARRAY['pending'::character varying, 'processing'::character varying])::"text"[]));



CREATE INDEX "idx_etl_jobs_user_rate_limit" ON "alpha_raw"."etl_job_queue" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_hyperliquid_vault_apr_brin_time" ON "alpha_raw"."hyperliquid_vault_apr_snapshots" USING "brin" ("snapshot_time");



CREATE INDEX "idx_hyperliquid_vault_apr_latest" ON "alpha_raw"."hyperliquid_vault_apr_snapshots" USING "btree" ("vault_address", "snapshot_time" DESC);



CREATE INDEX "idx_hyperliquid_vault_apr_source" ON "alpha_raw"."hyperliquid_vault_apr_snapshots" USING "btree" ("source", "snapshot_time" DESC);



CREATE INDEX "idx_hyperliquid_vault_apr_time" ON "alpha_raw"."hyperliquid_vault_apr_snapshots" USING "btree" ("snapshot_time" DESC);



CREATE INDEX "idx_hyperliquid_vault_name_trgm" ON "alpha_raw"."hyperliquid_vault_apr_snapshots" USING "gin" ("lower"("vault_name") "public"."gin_trgm_ops");



CREATE INDEX "idx_macro_fear_greed_snapshot_date_desc" ON "alpha_raw"."macro_fear_greed_snapshots" USING "btree" ("snapshot_date" DESC);



CREATE INDEX "idx_macro_fear_greed_source_date_desc" ON "alpha_raw"."macro_fear_greed_snapshots" USING "btree" ("source", "snapshot_date" DESC);



CREATE UNIQUE INDEX "idx_macro_fear_greed_unique_source_date" ON "alpha_raw"."macro_fear_greed_snapshots" USING "btree" ("source", "snapshot_date");



CREATE INDEX "idx_sentiment_snapshots_snapshot_time_desc" ON "alpha_raw"."sentiment_snapshots" USING "btree" ("snapshot_time" DESC);



CREATE INDEX "idx_sentiment_snapshots_source_snapshot_time" ON "alpha_raw"."sentiment_snapshots" USING "btree" ("source", "snapshot_time" DESC);



CREATE UNIQUE INDEX "idx_sentiment_snapshots_unique_snapshot" ON "alpha_raw"."sentiment_snapshots" USING "btree" ("source", "snapshot_time");



CREATE INDEX "idx_stock_price_dma_date_desc" ON "alpha_raw"."stock_price_dma_snapshots" USING "btree" ("symbol", "snapshot_date" DESC);



CREATE UNIQUE INDEX "idx_stock_price_dma_unique" ON "alpha_raw"."stock_price_dma_snapshots" USING "btree" ("source", "symbol", "snapshot_date");



CREATE INDEX "idx_stock_price_snapshots_symbol_date" ON "alpha_raw"."stock_price_snapshots" USING "btree" ("symbol", "snapshot_date" DESC);



CREATE UNIQUE INDEX "idx_stock_price_snapshots_unique" ON "alpha_raw"."stock_price_snapshots" USING "btree" ("source", "symbol", "snapshot_date");



CREATE INDEX "idx_token_pair_ratio_dma_date_desc" ON "alpha_raw"."token_pair_ratio_dma_snapshots" USING "btree" ("base_token_symbol", "quote_token_symbol", "snapshot_date" DESC);



CREATE UNIQUE INDEX "idx_token_pair_ratio_dma_unique" ON "alpha_raw"."token_pair_ratio_dma_snapshots" USING "btree" ("source", "base_token_symbol", "quote_token_symbol", "snapshot_date");



CREATE INDEX "idx_token_price_dma_date_desc" ON "alpha_raw"."token_price_dma_snapshots" USING "btree" ("token_symbol", "snapshot_date" DESC);



CREATE UNIQUE INDEX "idx_token_price_dma_unique" ON "alpha_raw"."token_price_dma_snapshots" USING "btree" ("source", "token_symbol", "snapshot_date");



CREATE INDEX "idx_token_price_snapshots_date_desc" ON "alpha_raw"."token_price_snapshots" USING "btree" ("snapshot_date" DESC);



CREATE INDEX "idx_token_price_snapshots_token_symbol" ON "alpha_raw"."token_price_snapshots" USING "btree" ("token_symbol");



CREATE UNIQUE INDEX "idx_token_price_snapshots_unique_snapshot" ON "alpha_raw"."token_price_snapshots" USING "btree" ("source", "token_symbol", "snapshot_date");



CREATE UNIQUE INDEX "daily_category_trends_uniq_idx" ON "analytics"."daily_category_trends" USING "btree" ("user_id", "date", "category", "source_type");



CREATE INDEX "daily_category_trends_user_category_idx" ON "analytics"."daily_category_trends" USING "btree" ("user_id", "category");



CREATE INDEX "daily_category_trends_user_date_idx" ON "analytics"."daily_category_trends" USING "btree" ("user_id", "date" DESC);



CREATE INDEX "daily_category_trends_user_source_idx" ON "analytics"."daily_category_trends" USING "btree" ("user_id", "source_type");



CREATE UNIQUE INDEX "daily_portfolio_positions_id_idx" ON "analytics"."daily_portfolio_positions" USING "btree" ("id");



CREATE INDEX "daily_portfolio_positions_wallet_date_idx" ON "analytics"."daily_portfolio_positions" USING "btree" ("wallet", "snapshot_date");



CREATE INDEX "daily_portfolio_positions_wallet_date_source_idx" ON "analytics"."daily_portfolio_positions" USING "btree" ("wallet", "snapshot_date", "source");



CREATE UNIQUE INDEX "episodes_source_url_key" ON "from_fed_to_chain"."episodes" USING "btree" ("source_url");



CREATE INDEX "idx_episode_localizations_language_created" ON "from_fed_to_chain"."episode_localizations" USING "btree" ("language_code", "created_at" DESC, "episode_id" DESC);



CREATE INDEX "idx_episode_video_visuals_claim_queue" ON "from_fed_to_chain"."episode_video_visuals" USING "btree" ("next_attempt_at", "created_at") WHERE ("status" = 'queued'::"text");



CREATE INDEX "idx_episode_video_visuals_expired_leases" ON "from_fed_to_chain"."episode_video_visuals" USING "btree" ("lease_expires_at") WHERE ("status" = 'processing'::"text");



CREATE INDEX "idx_episode_videos_claim_queue" ON "from_fed_to_chain"."episode_videos" USING "btree" ("next_attempt_at", "created_at") WHERE ("status" = 'queued'::"text");



CREATE INDEX "idx_episode_videos_expired_leases" ON "from_fed_to_chain"."episode_videos" USING "btree" ("lease_expires_at") WHERE ("status" = 'processing'::"text");



CREATE INDEX "idx_episode_videos_visual_checkpoint" ON "from_fed_to_chain"."episode_videos" USING "btree" ("episode_id", "visual_hash", "visual_version");



CREATE INDEX "idx_episodes_created_at" ON "from_fed_to_chain"."episodes" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_episodes_created_at_id" ON "from_fed_to_chain"."episodes" USING "btree" ("created_at" DESC, "id" DESC);



CREATE INDEX "idx_likes_episode" ON "from_fed_to_chain"."likes" USING "btree" ("episode_id");



CREATE INDEX "idx_social_account_snapshots_platform_captured" ON "from_fed_to_chain"."social_account_snapshots" USING "btree" ("platform", "captured_at" DESC);



CREATE INDEX "idx_social_post_metrics_post_captured" ON "from_fed_to_chain"."social_post_metrics" USING "btree" ("social_post_id", "captured_at");



CREATE UNIQUE INDEX "idx_social_post_metrics_standard_window" ON "from_fed_to_chain"."social_post_metrics" USING "btree" ("social_post_id", "measurement_window") WHERE ("measurement_window" IS NOT NULL);



CREATE INDEX "idx_social_posts_episode_platform" ON "from_fed_to_chain"."social_posts" USING "btree" ("episode_id", "platform");



CREATE INDEX "idx_social_publish_jobs_due" ON "from_fed_to_chain"."social_publish_jobs" USING "btree" ("next_attempt_at", "scheduled_at") WHERE ("status" = ANY (ARRAY['queued'::"text", 'failed'::"text"]));



CREATE INDEX "idx_social_publish_jobs_expired_lease" ON "from_fed_to_chain"."social_publish_jobs" USING "btree" ("lease_expires_at") WHERE ("status" = 'processing'::"text");



CREATE UNIQUE INDEX "idx_social_strategy_versions_one_active" ON "from_fed_to_chain"."social_strategy_versions" USING "btree" ("platform") WHERE "active";



CREATE UNIQUE INDEX "idx_users_device_id_unique" ON "from_fed_to_chain"."users" USING "btree" ("device_id") WHERE ("device_id" IS NOT NULL);



CREATE INDEX "idx_cost_rates_lookup" ON "ops"."cost_rates" USING "btree" ("provider", "metric_key", "effective_from" DESC);



CREATE INDEX "idx_cost_snapshots_period" ON "ops"."cost_snapshots" USING "btree" ("snapshot_date" DESC, "provider");



CREATE INDEX "idx_cost_transactions_charged" ON "ops"."cost_transactions" USING "btree" ("charged_at" DESC, "provider");



CREATE UNIQUE INDEX "idx_cost_transactions_external_id" ON "ops"."cost_transactions" USING "btree" ("provider", "external_id") WHERE ("external_id" IS NOT NULL);



CREATE INDEX "idx_active_telegram_users" ON "public"."notification_settings" USING "btree" ("user_id") WHERE (("channel_type" = 'telegram'::"text") AND ("is_enabled" = true));



CREATE INDEX "idx_job_logs_job_id" ON "public"."job_logs" USING "btree" ("job_id");



CREATE INDEX "idx_job_logs_level" ON "public"."job_logs" USING "btree" ("level");



CREATE INDEX "idx_jobs_scheduled_at" ON "public"."jobs" USING "btree" ("scheduled_at");



CREATE INDEX "idx_jobs_status" ON "public"."jobs" USING "btree" ("status");



CREATE INDEX "idx_jobs_status_priority" ON "public"."jobs" USING "btree" ("status", "priority" DESC);



CREATE INDEX "idx_jobs_type" ON "public"."jobs" USING "btree" ("type");



CREATE INDEX "idx_ledger_decision_events_occurred_at" ON "public"."ledger_decision_events" USING "btree" ("occurred_at");



CREATE INDEX "idx_ledger_decision_events_user_id" ON "public"."ledger_decision_events" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_ledger_execution_events_occurred_at" ON "public"."ledger_execution_events" USING "btree" ("occurred_at");



CREATE INDEX "idx_ledger_execution_events_user_id" ON "public"."ledger_execution_events" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_ledger_plan_events_occurred_at" ON "public"."ledger_plan_events" USING "btree" ("occurred_at");



CREATE INDEX "idx_ledger_plan_events_user_id" ON "public"."ledger_plan_events" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_ledger_signal_events_occurred_at" ON "public"."ledger_signal_events" USING "btree" ("occurred_at");



CREATE INDEX "idx_notification_settings_user_id" ON "public"."notification_settings" USING "btree" ("user_id");



CREATE INDEX "idx_strategy_trade_history_user_trade_date" ON "public"."strategy_trade_history" USING "btree" ("user_id", "trade_date" DESC);



CREATE INDEX "idx_telegram_tokens_expires_at" ON "public"."telegram_verification_tokens" USING "btree" ("expires_at") WHERE ("used_at" IS NULL);



CREATE INDEX "idx_telegram_tokens_user_rate_limit" ON "public"."telegram_verification_tokens" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_telegram_tokens_validation" ON "public"."telegram_verification_tokens" USING "btree" ("token", "expires_at") WHERE ("used_at" IS NULL);



CREATE INDEX "idx_user_subscriptions_active" ON "public"."user_subscriptions" USING "btree" ("user_id", "plan_code", "starts_at", COALESCE("ends_at", 'infinity'::timestamp with time zone));



CREATE INDEX "idx_user_subscriptions_plan_code" ON "public"."user_subscriptions" USING "btree" ("plan_code");



CREATE INDEX "idx_user_subscriptions_user_active" ON "public"."user_subscriptions" USING "btree" ("user_id", "created_at" DESC) WHERE (NOT "is_canceled");



CREATE INDEX "idx_user_wallets_last_update" ON "public"."user_crypto_wallets" USING "btree" ("last_portfolio_update_at" DESC);



CREATE INDEX "idx_user_wallets_user_id_update" ON "public"."user_crypto_wallets" USING "btree" ("user_id", "last_portfolio_update_at" DESC);



CREATE INDEX "idx_users_last_activity" ON "public"."users" USING "btree" ("last_activity_at" DESC);



CREATE UNIQUE INDEX "strategy_saved_configs_single_default_idx" ON "public"."strategy_saved_configs" USING "btree" ("is_default") WHERE ("is_default" = true);



CREATE INDEX "idx_content_category" ON "review_web"."content" USING "btree" ("category");



CREATE INDEX "idx_content_date" ON "review_web"."content" USING "btree" ("date" DESC);



CREATE INDEX "idx_content_language" ON "review_web"."content" USING "btree" ("language");



CREATE INDEX "idx_content_status" ON "review_web"."content" USING "btree" ("status");



CREATE INDEX "idx_content_status_lang" ON "review_web"."content" USING "btree" ("status", "language");



CREATE INDEX "idx_pipeline_jobs_content_id" ON "review_web"."pipeline_jobs" USING "btree" ("content_id");



CREATE INDEX "idx_pipeline_jobs_created_at" ON "review_web"."pipeline_jobs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_pipeline_jobs_status" ON "review_web"."pipeline_jobs" USING "btree" ("status");



CREATE OR REPLACE TRIGGER "trg_language_classrooms_after_delete" AFTER DELETE ON "from_fed_to_chain"."language_classrooms" REFERENCING OLD TABLE AS "old_rows" FOR EACH STATEMENT EXECUTE FUNCTION "from_fed_to_chain_private"."sync_language_classrooms_after_delete"();



CREATE OR REPLACE TRIGGER "trg_language_classrooms_after_insert" AFTER INSERT ON "from_fed_to_chain"."language_classrooms" REFERENCING NEW TABLE AS "new_rows" FOR EACH STATEMENT EXECUTE FUNCTION "from_fed_to_chain_private"."sync_language_classrooms_after_insert"();



CREATE OR REPLACE TRIGGER "trg_language_classrooms_after_update" AFTER UPDATE ON "from_fed_to_chain"."language_classrooms" REFERENCING OLD TABLE AS "old_rows" NEW TABLE AS "new_rows" FOR EACH STATEMENT EXECUTE FUNCTION "from_fed_to_chain_private"."sync_language_classrooms_after_update"();



CREATE OR REPLACE TRIGGER "trg_ledger_decision_events_append_only" BEFORE DELETE OR UPDATE ON "public"."ledger_decision_events" FOR EACH ROW EXECUTE FUNCTION "public"."ledger_forbid_mutation"();



CREATE OR REPLACE TRIGGER "trg_ledger_execution_events_append_only" BEFORE DELETE OR UPDATE ON "public"."ledger_execution_events" FOR EACH ROW EXECUTE FUNCTION "public"."ledger_forbid_mutation"();



CREATE OR REPLACE TRIGGER "trg_ledger_plan_events_append_only" BEFORE DELETE OR UPDATE ON "public"."ledger_plan_events" FOR EACH ROW EXECUTE FUNCTION "public"."ledger_forbid_mutation"();



CREATE OR REPLACE TRIGGER "trg_ledger_signal_events_append_only" BEFORE DELETE OR UPDATE ON "public"."ledger_signal_events" FOR EACH ROW EXECUTE FUNCTION "public"."ledger_forbid_mutation"();



CREATE OR REPLACE TRIGGER "update_jobs_updated_at" BEFORE UPDATE ON "public"."jobs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_content_updated_at" BEFORE UPDATE ON "review_web"."content" FOR EACH ROW EXECUTE FUNCTION "review_web"."update_updated_at_column"();



ALTER TABLE ONLY "alpha_raw"."etl_job_queue"
    ADD CONSTRAINT "etl_job_queue_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "from_fed_to_chain"."episode_localizations"
    ADD CONSTRAINT "episode_localizations_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "from_fed_to_chain"."episodes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "from_fed_to_chain"."episode_video_visuals"
    ADD CONSTRAINT "episode_video_visuals_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "from_fed_to_chain"."episodes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "from_fed_to_chain"."episode_videos"
    ADD CONSTRAINT "episode_videos_episode_fk" FOREIGN KEY ("episode_id") REFERENCES "from_fed_to_chain"."episodes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "from_fed_to_chain"."episode_videos"
    ADD CONSTRAINT "episode_videos_episode_localization_id_fkey" FOREIGN KEY ("episode_localization_id") REFERENCES "from_fed_to_chain"."episode_localizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "from_fed_to_chain"."episode_videos"
    ADD CONSTRAINT "episode_videos_visual_checkpoint_fk" FOREIGN KEY ("episode_id", "visual_hash", "visual_version") REFERENCES "from_fed_to_chain"."episode_video_visuals"("episode_id", "visual_hash", "visual_version");



ALTER TABLE ONLY "from_fed_to_chain"."language_classrooms"
    ADD CONSTRAINT "language_classrooms_episode_localization_id_fkey" FOREIGN KEY ("episode_localization_id") REFERENCES "from_fed_to_chain"."episode_localizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "from_fed_to_chain"."likes"
    ADD CONSTRAINT "likes_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "from_fed_to_chain"."episodes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "from_fed_to_chain"."likes"
    ADD CONSTRAINT "likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "from_fed_to_chain"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "from_fed_to_chain"."social_post_metrics"
    ADD CONSTRAINT "social_post_metrics_social_post_id_fkey" FOREIGN KEY ("social_post_id") REFERENCES "from_fed_to_chain"."social_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "from_fed_to_chain"."social_posts"
    ADD CONSTRAINT "social_posts_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "from_fed_to_chain"."episodes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "from_fed_to_chain"."social_publish_jobs"
    ADD CONSTRAINT "social_publish_jobs_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "from_fed_to_chain"."episodes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "from_fed_to_chain"."social_publish_jobs"
    ADD CONSTRAINT "social_publish_jobs_social_post_id_fkey" FOREIGN KEY ("social_post_id") REFERENCES "from_fed_to_chain"."social_posts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "from_fed_to_chain"."social_publish_jobs"
    ADD CONSTRAINT "social_publish_jobs_strategy_version_id_fkey" FOREIGN KEY ("strategy_version_id") REFERENCES "from_fed_to_chain"."social_strategy_versions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "from_fed_to_chain"."user_episode_state"
    ADD CONSTRAINT "user_episode_state_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "from_fed_to_chain"."episodes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "from_fed_to_chain"."user_episode_state"
    ADD CONSTRAINT "user_episode_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "from_fed_to_chain"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "ops"."cost_snapshots"
    ADD CONSTRAINT "cost_snapshots_pricing_rate_id_fkey" FOREIGN KEY ("pricing_rate_id") REFERENCES "ops"."cost_rates"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."job_logs"
    ADD CONSTRAINT "job_logs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ledger_decision_events"
    ADD CONSTRAINT "ledger_decision_events_signal_event_id_fkey" FOREIGN KEY ("signal_event_id") REFERENCES "public"."ledger_signal_events"("id");



ALTER TABLE ONLY "public"."ledger_execution_events"
    ADD CONSTRAINT "ledger_execution_events_plan_event_id_fkey" FOREIGN KEY ("plan_event_id") REFERENCES "public"."ledger_plan_events"("id");



ALTER TABLE ONLY "public"."ledger_plan_events"
    ADD CONSTRAINT "ledger_plan_events_decision_event_id_fkey" FOREIGN KEY ("decision_event_id") REFERENCES "public"."ledger_decision_events"("id");



ALTER TABLE ONLY "public"."notification_settings"
    ADD CONSTRAINT "notification_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."telegram_verification_tokens"
    ADD CONSTRAINT "telegram_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_crypto_wallets"
    ADD CONSTRAINT "user_crypto_wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_plan_code_fkey" FOREIGN KEY ("plan_code") REFERENCES "public"."plans"("code");



ALTER TABLE ONLY "public"."user_subscriptions"
    ADD CONSTRAINT "user_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE "analytics"."daily_category_trends" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_category_trends_select" ON "analytics"."daily_category_trends" FOR SELECT USING (true);



ALTER TABLE "analytics"."daily_portfolio_positions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_portfolio_positions_etl_write" ON "analytics"."daily_portfolio_positions" TO "alpha_etl_user" USING (true) WITH CHECK (true);



CREATE POLICY "daily_portfolio_positions_select" ON "analytics"."daily_portfolio_positions" FOR SELECT USING (true);



ALTER TABLE "analytics"."daily_wallet_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "daily_wallet_tokens_etl_write" ON "analytics"."daily_wallet_tokens" TO "alpha_etl_user" USING (true) WITH CHECK (true);



CREATE POLICY "daily_wallet_tokens_select" ON "analytics"."daily_wallet_tokens" FOR SELECT USING (true);



CREATE POLICY "Service role can manage episode localizations" ON "from_fed_to_chain"."episode_localizations" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage episode video visuals" ON "from_fed_to_chain"."episode_video_visuals" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage episode videos" ON "from_fed_to_chain"."episode_videos" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage episodes" ON "from_fed_to_chain"."episodes" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage language classrooms" ON "from_fed_to_chain"."language_classrooms" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage social account snapshots" ON "from_fed_to_chain"."social_account_snapshots" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage social post metrics" ON "from_fed_to_chain"."social_post_metrics" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage social posts" ON "from_fed_to_chain"."social_posts" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "anon delete likes" ON "from_fed_to_chain"."likes" FOR DELETE TO "authenticated", "anon" USING (true);



CREATE POLICY "anon insert likes" ON "from_fed_to_chain"."likes" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "anon insert podcast users" ON "from_fed_to_chain"."users" FOR INSERT TO "authenticated", "anon" WITH CHECK ((("device_id" IS NOT NULL) OR ("display_name" = 'From Fed to Chain listener'::"text")));



CREATE POLICY "anon read completed episode localizations" ON "from_fed_to_chain"."episode_localizations" FOR SELECT TO "authenticated", "anon" USING ((("status" = 'completed'::"text") AND (NULLIF("btrim"("hls_url"), ''::"text") IS NOT NULL) AND (("language_code" <> 'zh-Hant'::"text") OR (NULLIF("btrim"("classroom_hls_url"), ''::"text") IS NOT NULL))));



CREATE POLICY "anon read completed language classrooms" ON "from_fed_to_chain"."language_classrooms" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "from_fed_to_chain"."episode_localizations" "el"
  WHERE (("el"."id" = "language_classrooms"."episode_localization_id") AND ("el"."status" = 'completed'::"text") AND (NULLIF("btrim"("el"."hls_url"), ''::"text") IS NOT NULL) AND (("el"."language_code" <> 'zh-Hant'::"text") OR (NULLIF("btrim"("el"."classroom_hls_url"), ''::"text") IS NOT NULL))))));



CREATE POLICY "anon read completed podcast episodes" ON "from_fed_to_chain"."episodes" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "from_fed_to_chain"."episode_localizations" "el"
  WHERE (("el"."episode_id" = "episodes"."id") AND ("el"."status" = 'completed'::"text") AND (NULLIF("btrim"("el"."hls_url"), ''::"text") IS NOT NULL) AND (("el"."language_code" <> 'zh-Hant'::"text") OR (NULLIF("btrim"("el"."classroom_hls_url"), ''::"text") IS NOT NULL))))));



CREATE POLICY "anon read likes" ON "from_fed_to_chain"."likes" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "anon read podcast users" ON "from_fed_to_chain"."users" FOR SELECT TO "authenticated", "anon" USING ((("device_id" IS NOT NULL) OR ("display_name" = 'From Fed to Chain listener'::"text")));



CREATE POLICY "anon read state" ON "from_fed_to_chain"."user_episode_state" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "anon update likes" ON "from_fed_to_chain"."likes" FOR UPDATE TO "authenticated", "anon" USING (true) WITH CHECK (true);



CREATE POLICY "anon update podcast users" ON "from_fed_to_chain"."users" FOR UPDATE TO "authenticated", "anon" USING ((("device_id" IS NOT NULL) OR ("display_name" = 'From Fed to Chain listener'::"text"))) WITH CHECK ((("device_id" IS NOT NULL) OR ("display_name" = 'From Fed to Chain listener'::"text")));



CREATE POLICY "anon write state" ON "from_fed_to_chain"."user_episode_state" TO "authenticated", "anon" USING (true) WITH CHECK (true);



ALTER TABLE "from_fed_to_chain"."episode_localizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "from_fed_to_chain"."episode_video_visuals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "from_fed_to_chain"."episode_videos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "from_fed_to_chain"."episodes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "from_fed_to_chain"."language_classrooms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "from_fed_to_chain"."likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "from_fed_to_chain"."social_account_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "from_fed_to_chain"."social_daemon_state" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "social_daemon_state_service_all" ON "from_fed_to_chain"."social_daemon_state" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "from_fed_to_chain"."social_post_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "from_fed_to_chain"."social_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "from_fed_to_chain"."social_publish_jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "social_publish_jobs_service_all" ON "from_fed_to_chain"."social_publish_jobs" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "from_fed_to_chain"."social_strategy_versions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "social_strategy_versions_service_all" ON "from_fed_to_chain"."social_strategy_versions" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "from_fed_to_chain"."user_episode_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "from_fed_to_chain"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Service role can manage cost rates" ON "ops"."cost_rates" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage cost snapshots" ON "ops"."cost_snapshots" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage cost transactions" ON "ops"."cost_transactions" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "ops"."cost_rates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "ops"."cost_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "ops"."cost_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Allow anon to manage job logs" ON "public"."job_logs" USING (true);



CREATE POLICY "Allow anon to manage jobs" ON "public"."jobs" USING (true);



CREATE POLICY "Service role can manage job logs" ON "public"."job_logs" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role can manage jobs" ON "public"."jobs" USING (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."job_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ledger_decision_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ledger_execution_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ledger_plan_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ledger_signal_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."strategy_change_notification_state" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Enable all access for service role" ON "review_web"."content" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Enable read access for all users" ON "review_web"."content" FOR SELECT USING (true);



CREATE POLICY "Service role has full access to pipeline_jobs" ON "review_web"."pipeline_jobs" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "review_web"."content" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "review_web"."pipeline_jobs" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "alpha_raw"."token_price_snapshots";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "from_fed_to_chain"."likes";



GRANT ALL ON SCHEMA "alpha_raw" TO "alpha_etl_user";
GRANT USAGE ON SCHEMA "alpha_raw" TO "readonly_user";



GRANT USAGE ON SCHEMA "analytics" TO "alpha_etl_user";
GRANT USAGE ON SCHEMA "analytics" TO "readonly_user";
GRANT USAGE ON SCHEMA "analytics" TO "anon";
GRANT USAGE ON SCHEMA "analytics" TO "authenticated";
GRANT USAGE ON SCHEMA "analytics" TO "service_role";



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



GRANT USAGE ON SCHEMA "from_fed_to_chain" TO "anon";
GRANT USAGE ON SCHEMA "from_fed_to_chain" TO "authenticated";
GRANT USAGE ON SCHEMA "from_fed_to_chain" TO "service_role";



GRANT USAGE ON SCHEMA "ops" TO "service_role";



GRANT USAGE ON SCHEMA "private" TO "alpha_etl_user";
GRANT USAGE ON SCHEMA "private" TO "readonly_user";
GRANT USAGE ON SCHEMA "private" TO "anon";
GRANT USAGE ON SCHEMA "private" TO "authenticated";
GRANT USAGE ON SCHEMA "private" TO "service_role";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";
GRANT USAGE ON SCHEMA "public" TO "readonly_user";
GRANT ALL ON SCHEMA "public" TO "alpha_etl_user";



GRANT USAGE ON SCHEMA "review_web" TO "anon";
GRANT USAGE ON SCHEMA "review_web" TO "authenticated";
GRANT USAGE ON SCHEMA "review_web" TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";



REVOKE ALL ON FUNCTION "analytics"."rebuild_category_trends"("p_user_ids" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "analytics"."rebuild_category_trends"("p_user_ids" "text"[]) TO "alpha_etl_user";















































































































































































































GRANT ALL ON TABLE "from_fed_to_chain"."episode_videos" TO "service_role";



REVOKE ALL ON FUNCTION "from_fed_to_chain"."claim_episode_video"("p_lease_owner" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "from_fed_to_chain"."claim_episode_video"("p_lease_owner" "text") TO "service_role";



REVOKE ALL ON FUNCTION "from_fed_to_chain"."claim_episode_video_v2"("p_lease_owner" "text", "p_visual_version" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "from_fed_to_chain"."claim_episode_video_v2"("p_lease_owner" "text", "p_visual_version" "text") TO "service_role";



GRANT ALL ON TABLE "from_fed_to_chain"."episode_video_visuals" TO "service_role";



REVOKE ALL ON FUNCTION "from_fed_to_chain"."claim_episode_video_visual"("p_lease_owner" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "from_fed_to_chain"."claim_episode_video_visual"("p_lease_owner" "text") TO "service_role";



REVOKE ALL ON FUNCTION "from_fed_to_chain"."claim_episode_video_visual_v2"("p_lease_owner" "text", "p_visual_version" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "from_fed_to_chain"."claim_episode_video_visual_v2"("p_lease_owner" "text", "p_visual_version" "text") TO "service_role";



GRANT ALL ON TABLE "from_fed_to_chain"."social_publish_jobs" TO "service_role";



REVOKE ALL ON FUNCTION "from_fed_to_chain"."claim_social_publish_batch"("p_owner" "text", "p_now" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "from_fed_to_chain"."claim_social_publish_batch"("p_owner" "text", "p_now" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "from_fed_to_chain"."complete_episode_video"("p_episode_localization_id" "uuid", "p_lease_owner" "text", "p_mp4_url" "text", "p_thumbnail_url" "text", "p_manifest_url" "text", "p_captions_ass_url" "text", "p_r2_prefix" "text", "p_duration_seconds" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "from_fed_to_chain"."complete_episode_video"("p_episode_localization_id" "uuid", "p_lease_owner" "text", "p_mp4_url" "text", "p_thumbnail_url" "text", "p_manifest_url" "text", "p_captions_ass_url" "text", "p_r2_prefix" "text", "p_duration_seconds" double precision) TO "service_role";



REVOKE ALL ON FUNCTION "from_fed_to_chain"."complete_episode_video_visual"("p_episode_id" "uuid", "p_lease_owner" "text", "p_visual_payload" "jsonb", "p_visual_hash" "text", "p_visual_version" "text", "p_source_hash" "text", "p_r2_prefix" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "from_fed_to_chain"."complete_episode_video_visual"("p_episode_id" "uuid", "p_lease_owner" "text", "p_visual_payload" "jsonb", "p_visual_hash" "text", "p_visual_version" "text", "p_source_hash" "text", "p_r2_prefix" "text") TO "service_role";



REVOKE ALL ON FUNCTION "from_fed_to_chain"."enqueue_episode_video"("p_episode_localization_id" "uuid", "p_telegram_chat_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "from_fed_to_chain"."enqueue_episode_video"("p_episode_localization_id" "uuid", "p_telegram_chat_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "from_fed_to_chain"."enqueue_episode_video_visual"("p_episode_id" "uuid", "p_visual_version" "text", "p_source_hash" "text", "p_telegram_chat_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "from_fed_to_chain"."enqueue_episode_video_visual"("p_episode_id" "uuid", "p_visual_version" "text", "p_source_hash" "text", "p_telegram_chat_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "from_fed_to_chain"."fail_episode_video"("p_episode_localization_id" "uuid", "p_lease_owner" "text", "p_last_error" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "from_fed_to_chain"."fail_episode_video"("p_episode_localization_id" "uuid", "p_lease_owner" "text", "p_last_error" "text") TO "service_role";



REVOKE ALL ON FUNCTION "from_fed_to_chain"."fail_episode_video_visual"("p_episode_id" "uuid", "p_lease_owner" "text", "p_last_error" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "from_fed_to_chain"."fail_episode_video_visual"("p_episode_id" "uuid", "p_lease_owner" "text", "p_last_error" "text") TO "service_role";



REVOKE ALL ON FUNCTION "from_fed_to_chain"."mark_episode_video_failure_notified"("p_episode_localization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "from_fed_to_chain"."mark_episode_video_failure_notified"("p_episode_localization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "from_fed_to_chain"."ops_insert_cost_transaction"("p_provider" "text", "p_amount_usd" numeric, "p_charged_at" timestamp with time zone, "p_kind" "text", "p_source" "text", "p_external_id" "text", "p_description" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "from_fed_to_chain"."ops_insert_cost_transaction"("p_provider" "text", "p_amount_usd" numeric, "p_charged_at" timestamp with time zone, "p_kind" "text", "p_source" "text", "p_external_id" "text", "p_description" "text") TO "service_role";



REVOKE ALL ON FUNCTION "from_fed_to_chain"."ops_upsert_cost_snapshot"("p_provider" "text", "p_snapshot_date" "date", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_accrued_cost_usd" numeric, "p_projected_cost_usd" numeric, "p_cost_type" "text", "p_source" "text", "p_usage" "jsonb", "p_pricing_rate_id" "uuid", "p_fetched_at" timestamp with time zone, "p_updated_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "from_fed_to_chain"."ops_upsert_cost_snapshot"("p_provider" "text", "p_snapshot_date" "date", "p_period_start" timestamp with time zone, "p_period_end" timestamp with time zone, "p_accrued_cost_usd" numeric, "p_projected_cost_usd" numeric, "p_cost_type" "text", "p_source" "text", "p_usage" "jsonb", "p_pricing_rate_id" "uuid", "p_fetched_at" timestamp with time zone, "p_updated_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "from_fed_to_chain"."reap_failed_episode_video_notifications"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "from_fed_to_chain"."reap_failed_episode_video_notifications"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "from_fed_to_chain"."renew_episode_video_lease"("p_episode_localization_id" "uuid", "p_lease_owner" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "from_fed_to_chain"."renew_episode_video_lease"("p_episode_localization_id" "uuid", "p_lease_owner" "text") TO "service_role";



REVOKE ALL ON FUNCTION "from_fed_to_chain"."renew_episode_video_visual_lease"("p_episode_id" "uuid", "p_lease_owner" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "from_fed_to_chain"."renew_episode_video_visual_lease"("p_episode_id" "uuid", "p_lease_owner" "text") TO "service_role";



REVOKE ALL ON FUNCTION "from_fed_to_chain"."report_episode_video_progress"("p_episode_localization_id" "uuid", "p_lease_owner" "text", "p_percent" integer, "p_stage" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "from_fed_to_chain"."report_episode_video_progress"("p_episode_localization_id" "uuid", "p_lease_owner" "text", "p_percent" integer, "p_stage" "text") TO "service_role";



REVOKE ALL ON FUNCTION "from_fed_to_chain"."report_episode_video_visual_progress"("p_episode_id" "uuid", "p_lease_owner" "text", "p_percent" integer, "p_stage" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "from_fed_to_chain"."report_episode_video_visual_progress"("p_episode_id" "uuid", "p_lease_owner" "text", "p_percent" integer, "p_stage" "text") TO "service_role";



REVOKE ALL ON FUNCTION "from_fed_to_chain"."save_episode_video_manifest"("p_episode_localization_id" "uuid", "p_lease_owner" "text", "p_manifest" "jsonb", "p_manifest_hash" "text", "p_renderer_version" "text", "p_storyboard_provider" "text", "p_storyboard_model" "text", "p_storyboard_prompt_version" "text", "p_script_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "from_fed_to_chain"."save_episode_video_manifest"("p_episode_localization_id" "uuid", "p_lease_owner" "text", "p_manifest" "jsonb", "p_manifest_hash" "text", "p_renderer_version" "text", "p_storyboard_provider" "text", "p_storyboard_model" "text", "p_storyboard_prompt_version" "text", "p_script_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "from_fed_to_chain"."sign_in_podcast_user"("p_email" "text", "p_device_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "from_fed_to_chain"."sign_in_podcast_user"("p_email" "text", "p_device_id" "text") TO "anon";
GRANT ALL ON FUNCTION "from_fed_to_chain"."sign_in_podcast_user"("p_email" "text", "p_device_id" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "from_fed_to_chain_private"."refresh_language_classrooms_jsonb"("p_episode_localization_ids" "uuid"[]) FROM PUBLIC;



REVOKE ALL ON FUNCTION "from_fed_to_chain_private"."sync_language_classrooms_after_delete"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "from_fed_to_chain_private"."sync_language_classrooms_after_insert"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "from_fed_to_chain_private"."sync_language_classrooms_after_update"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "from_fed_to_chain_private"."upsert_podcast_user"("p_email" "text", "p_device_id" "text") FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."classify_token_category"("symbol" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."classify_token_category"("symbol" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."classify_token_category"("symbol" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."classify_token_category"("symbol" "text") TO "readonly_user";



GRANT ALL ON FUNCTION "public"."cleanup_expired_telegram_tokens"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_telegram_tokens"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_telegram_tokens"() TO "service_role";
GRANT ALL ON FUNCTION "public"."cleanup_expired_telegram_tokens"() TO "readonly_user";



GRANT ALL ON FUNCTION "public"."create_etl_job_for_wallet"("p_user_id" "uuid", "p_wallet_address" character varying, "p_job_type" character varying, "p_ip_address" character varying, "p_user_agent" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_etl_job_for_wallet"("p_user_id" "uuid", "p_wallet_address" character varying, "p_job_type" character varying, "p_ip_address" character varying, "p_user_agent" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_etl_job_for_wallet"("p_user_id" "uuid", "p_wallet_address" character varying, "p_job_type" character varying, "p_ip_address" character varying, "p_user_agent" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."create_etl_job_for_wallet"("p_user_id" "uuid", "p_wallet_address" character varying, "p_job_type" character varying, "p_ip_address" character varying, "p_user_agent" "text") TO "readonly_user";



GRANT ALL ON FUNCTION "public"."create_user_with_wallet_and_plan"("p_wallet" "text", "p_plan_code" "text", "p_wallet_label" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_user_with_wallet_and_plan"("p_wallet" "text", "p_plan_code" "text", "p_wallet_label" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_user_with_wallet_and_plan"("p_wallet" "text", "p_plan_code" "text", "p_wallet_label" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."create_user_with_wallet_and_plan"("p_wallet" "text", "p_plan_code" "text", "p_wallet_label" "text") TO "readonly_user";



GRANT ALL ON FUNCTION "public"."get_etl_job_status"("p_job_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_etl_job_status"("p_job_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_etl_job_status"("p_job_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_etl_job_status"("p_job_id" "uuid") TO "readonly_user";



GRANT ALL ON FUNCTION "public"."get_next_etl_job"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_etl_job"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_etl_job"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_next_etl_job"() TO "readonly_user";



GRANT ALL ON FUNCTION "public"."get_users_wallets_by_ids"("user_ids" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_users_wallets_by_ids"("user_ids" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_users_wallets_by_ids"("user_ids" "text"[]) TO "service_role";
GRANT ALL ON FUNCTION "public"."get_users_wallets_by_ids"("user_ids" "text"[]) TO "readonly_user";



GRANT ALL ON FUNCTION "public"."get_users_wallets_by_plan"("p_plan_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_users_wallets_by_plan"("p_plan_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_users_wallets_by_plan"("p_plan_code" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_users_wallets_by_plan"("p_plan_code" "text") TO "readonly_user";



GRANT ALL ON FUNCTION "public"."get_users_wallets_by_plan_with_activity"("plan_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_users_wallets_by_plan_with_activity"("plan_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_users_wallets_by_plan_with_activity"("plan_name" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_users_wallets_by_plan_with_activity"("plan_name" "text") TO "readonly_user";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."ledger_forbid_mutation"() TO "anon";
GRANT ALL ON FUNCTION "public"."ledger_forbid_mutation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ledger_forbid_mutation"() TO "service_role";
GRANT ALL ON FUNCTION "public"."ledger_forbid_mutation"() TO "readonly_user";



GRANT ALL ON FUNCTION "public"."select_one"() TO "anon";
GRANT ALL ON FUNCTION "public"."select_one"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."select_one"() TO "service_role";
GRANT ALL ON FUNCTION "public"."select_one"() TO "readonly_user";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "readonly_user";



GRANT ALL ON FUNCTION "public"."update_user_email_and_upgrade_plan"("p_user_id" "uuid", "p_email" "text", "p_upgrade_plan_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_email_and_upgrade_plan"("p_user_id" "uuid", "p_email" "text", "p_upgrade_plan_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_email_and_upgrade_plan"("p_user_id" "uuid", "p_email" "text", "p_upgrade_plan_code" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."update_user_email_and_upgrade_plan"("p_user_id" "uuid", "p_email" "text", "p_upgrade_plan_code" "text") TO "readonly_user";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";












GRANT SELECT,INSERT,DELETE ON TABLE "analytics"."daily_wallet_tokens" TO "alpha_etl_user";
GRANT SELECT ON TABLE "analytics"."daily_wallet_tokens" TO "readonly_user";
GRANT SELECT ON TABLE "analytics"."daily_wallet_tokens" TO "anon";
GRANT SELECT ON TABLE "analytics"."daily_wallet_tokens" TO "authenticated";
GRANT SELECT ON TABLE "analytics"."daily_wallet_tokens" TO "service_role";



GRANT SELECT ON TABLE "alpha_raw"."daily_wallet_token_snapshots" TO "readonly_user";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "alpha_raw"."daily_wallet_token_snapshots" TO "alpha_etl_user";
GRANT SELECT ON TABLE "alpha_raw"."daily_wallet_token_snapshots" TO "anon";
GRANT SELECT ON TABLE "alpha_raw"."daily_wallet_token_snapshots" TO "authenticated";
GRANT SELECT ON TABLE "alpha_raw"."daily_wallet_token_snapshots" TO "service_role";



GRANT SELECT ON TABLE "alpha_raw"."etl_job_queue" TO "readonly_user";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "alpha_raw"."etl_job_queue" TO "alpha_etl_user";



GRANT SELECT ON TABLE "alpha_raw"."hyperliquid_vault_apr_snapshots" TO "readonly_user";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "alpha_raw"."hyperliquid_vault_apr_snapshots" TO "alpha_etl_user";



GRANT SELECT ON TABLE "alpha_raw"."macro_fear_greed_snapshots" TO "readonly_user";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "alpha_raw"."macro_fear_greed_snapshots" TO "alpha_etl_user";



GRANT SELECT ON TABLE "alpha_raw"."sentiment_snapshots" TO "readonly_user";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "alpha_raw"."sentiment_snapshots" TO "alpha_etl_user";



GRANT SELECT ON TABLE "alpha_raw"."stock_price_dma_snapshots" TO "readonly_user";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "alpha_raw"."stock_price_dma_snapshots" TO "alpha_etl_user";



GRANT SELECT ON TABLE "alpha_raw"."stock_price_snapshots" TO "readonly_user";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "alpha_raw"."stock_price_snapshots" TO "alpha_etl_user";



GRANT SELECT ON TABLE "alpha_raw"."token_pair_ratio_dma_snapshots" TO "readonly_user";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "alpha_raw"."token_pair_ratio_dma_snapshots" TO "alpha_etl_user";



GRANT SELECT ON TABLE "alpha_raw"."token_price_dma_snapshots" TO "readonly_user";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "alpha_raw"."token_price_dma_snapshots" TO "alpha_etl_user";



GRANT SELECT ON TABLE "alpha_raw"."token_price_snapshots" TO "readonly_user";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "alpha_raw"."token_price_snapshots" TO "alpha_etl_user";



GRANT SELECT ON TABLE "analytics"."daily_category_trends" TO "alpha_etl_user";
GRANT SELECT ON TABLE "analytics"."daily_category_trends" TO "readonly_user";
GRANT SELECT ON TABLE "analytics"."daily_category_trends" TO "anon";
GRANT SELECT ON TABLE "analytics"."daily_category_trends" TO "authenticated";
GRANT SELECT ON TABLE "analytics"."daily_category_trends" TO "service_role";



GRANT SELECT,INSERT,DELETE ON TABLE "analytics"."daily_portfolio_positions" TO "alpha_etl_user";
GRANT SELECT ON TABLE "analytics"."daily_portfolio_positions" TO "readonly_user";
GRANT SELECT ON TABLE "analytics"."daily_portfolio_positions" TO "anon";
GRANT SELECT ON TABLE "analytics"."daily_portfolio_positions" TO "authenticated";
GRANT SELECT ON TABLE "analytics"."daily_portfolio_positions" TO "service_role";



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;















GRANT ALL ON TABLE "from_fed_to_chain"."episode_localizations" TO "service_role";



GRANT SELECT("id") ON TABLE "from_fed_to_chain"."episode_localizations" TO "anon";
GRANT SELECT("id") ON TABLE "from_fed_to_chain"."episode_localizations" TO "authenticated";



GRANT SELECT("episode_id") ON TABLE "from_fed_to_chain"."episode_localizations" TO "anon";
GRANT SELECT("episode_id") ON TABLE "from_fed_to_chain"."episode_localizations" TO "authenticated";



GRANT SELECT("language_code") ON TABLE "from_fed_to_chain"."episode_localizations" TO "anon";
GRANT SELECT("language_code") ON TABLE "from_fed_to_chain"."episode_localizations" TO "authenticated";



GRANT SELECT("title") ON TABLE "from_fed_to_chain"."episode_localizations" TO "anon";
GRANT SELECT("title") ON TABLE "from_fed_to_chain"."episode_localizations" TO "authenticated";



GRANT SELECT("hls_url") ON TABLE "from_fed_to_chain"."episode_localizations" TO "anon";
GRANT SELECT("hls_url") ON TABLE "from_fed_to_chain"."episode_localizations" TO "authenticated";



GRANT SELECT("script") ON TABLE "from_fed_to_chain"."episode_localizations" TO "anon";
GRANT SELECT("script") ON TABLE "from_fed_to_chain"."episode_localizations" TO "authenticated";



GRANT SELECT("llm_model") ON TABLE "from_fed_to_chain"."episode_localizations" TO "anon";
GRANT SELECT("llm_model") ON TABLE "from_fed_to_chain"."episode_localizations" TO "authenticated";



GRANT SELECT("llm_thinking_model") ON TABLE "from_fed_to_chain"."episode_localizations" TO "anon";
GRANT SELECT("llm_thinking_model") ON TABLE "from_fed_to_chain"."episode_localizations" TO "authenticated";



GRANT SELECT("llm_provider") ON TABLE "from_fed_to_chain"."episode_localizations" TO "anon";
GRANT SELECT("llm_provider") ON TABLE "from_fed_to_chain"."episode_localizations" TO "authenticated";



GRANT SELECT("status") ON TABLE "from_fed_to_chain"."episode_localizations" TO "anon";
GRANT SELECT("status") ON TABLE "from_fed_to_chain"."episode_localizations" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "from_fed_to_chain"."episode_localizations" TO "anon";
GRANT SELECT("created_at") ON TABLE "from_fed_to_chain"."episode_localizations" TO "authenticated";



GRANT SELECT("classroom_hls_url") ON TABLE "from_fed_to_chain"."episode_localizations" TO "anon";
GRANT SELECT("classroom_hls_url") ON TABLE "from_fed_to_chain"."episode_localizations" TO "authenticated";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "from_fed_to_chain"."episodes" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "from_fed_to_chain"."episodes" TO "authenticated";
GRANT ALL ON TABLE "from_fed_to_chain"."episodes" TO "service_role";
GRANT SELECT ON TABLE "from_fed_to_chain"."episodes" TO "readonly_user";
GRANT SELECT ON TABLE "from_fed_to_chain"."episodes" TO "alpha_etl_user";



GRANT SELECT("id") ON TABLE "from_fed_to_chain"."episodes" TO "anon";
GRANT SELECT("id") ON TABLE "from_fed_to_chain"."episodes" TO "authenticated";



GRANT SELECT("source_url") ON TABLE "from_fed_to_chain"."episodes" TO "anon";
GRANT SELECT("source_url") ON TABLE "from_fed_to_chain"."episodes" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "from_fed_to_chain"."episodes" TO "anon";
GRANT SELECT("created_at") ON TABLE "from_fed_to_chain"."episodes" TO "authenticated";



GRANT SELECT("listened") ON TABLE "from_fed_to_chain"."episodes" TO "anon";
GRANT SELECT("listened") ON TABLE "from_fed_to_chain"."episodes" TO "authenticated";



GRANT SELECT("source_title") ON TABLE "from_fed_to_chain"."episodes" TO "anon";
GRANT SELECT("source_title") ON TABLE "from_fed_to_chain"."episodes" TO "authenticated";



GRANT ALL ON TABLE "from_fed_to_chain"."likes" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "from_fed_to_chain"."likes" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "from_fed_to_chain"."likes" TO "authenticated";



GRANT SELECT("user_id"),INSERT("user_id"),UPDATE("user_id") ON TABLE "from_fed_to_chain"."likes" TO "anon";
GRANT SELECT("user_id"),INSERT("user_id"),UPDATE("user_id") ON TABLE "from_fed_to_chain"."likes" TO "authenticated";



GRANT SELECT("episode_id"),INSERT("episode_id"),UPDATE("episode_id") ON TABLE "from_fed_to_chain"."likes" TO "anon";
GRANT SELECT("episode_id"),INSERT("episode_id"),UPDATE("episode_id") ON TABLE "from_fed_to_chain"."likes" TO "authenticated";



GRANT SELECT ON TABLE "from_fed_to_chain"."episodes_with_stats" TO "anon";
GRANT SELECT ON TABLE "from_fed_to_chain"."episodes_with_stats" TO "authenticated";
GRANT SELECT ON TABLE "from_fed_to_chain"."episodes_with_stats" TO "service_role";



GRANT ALL ON TABLE "from_fed_to_chain"."language_classrooms" TO "service_role";



GRANT SELECT("source_language_code") ON TABLE "from_fed_to_chain"."language_classrooms" TO "anon";
GRANT SELECT("source_language_code") ON TABLE "from_fed_to_chain"."language_classrooms" TO "authenticated";



GRANT SELECT("target_language_code") ON TABLE "from_fed_to_chain"."language_classrooms" TO "anon";
GRANT SELECT("target_language_code") ON TABLE "from_fed_to_chain"."language_classrooms" TO "authenticated";



GRANT SELECT("one_liner") ON TABLE "from_fed_to_chain"."language_classrooms" TO "anon";
GRANT SELECT("one_liner") ON TABLE "from_fed_to_chain"."language_classrooms" TO "authenticated";



GRANT SELECT("keywords") ON TABLE "from_fed_to_chain"."language_classrooms" TO "anon";
GRANT SELECT("keywords") ON TABLE "from_fed_to_chain"."language_classrooms" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "from_fed_to_chain"."language_classrooms" TO "anon";
GRANT SELECT("created_at") ON TABLE "from_fed_to_chain"."language_classrooms" TO "authenticated";



GRANT SELECT("updated_at") ON TABLE "from_fed_to_chain"."language_classrooms" TO "anon";
GRANT SELECT("updated_at") ON TABLE "from_fed_to_chain"."language_classrooms" TO "authenticated";



GRANT SELECT("episode_localization_id") ON TABLE "from_fed_to_chain"."language_classrooms" TO "anon";
GRANT SELECT("episode_localization_id") ON TABLE "from_fed_to_chain"."language_classrooms" TO "authenticated";



GRANT SELECT("hls_url") ON TABLE "from_fed_to_chain"."language_classrooms" TO "anon";
GRANT SELECT("hls_url") ON TABLE "from_fed_to_chain"."language_classrooms" TO "authenticated";



GRANT ALL ON TABLE "ops"."cost_rates" TO "service_role";



GRANT SELECT ON TABLE "from_fed_to_chain"."ops_cost_rates" TO "service_role";



GRANT ALL ON TABLE "ops"."cost_snapshots" TO "service_role";



GRANT SELECT ON TABLE "from_fed_to_chain"."ops_cost_snapshots" TO "service_role";



GRANT ALL ON TABLE "ops"."cost_transactions" TO "service_role";



GRANT SELECT ON TABLE "from_fed_to_chain"."ops_cost_transactions" TO "service_role";



GRANT ALL ON TABLE "from_fed_to_chain"."social_account_snapshots" TO "service_role";



GRANT ALL ON TABLE "from_fed_to_chain"."social_daemon_state" TO "service_role";



GRANT ALL ON TABLE "from_fed_to_chain"."social_post_metrics" TO "service_role";



GRANT ALL ON TABLE "from_fed_to_chain"."social_posts" TO "service_role";



GRANT SELECT ON TABLE "from_fed_to_chain"."social_publish_candidates" TO "service_role";



GRANT ALL ON TABLE "from_fed_to_chain"."social_strategy_versions" TO "service_role";



GRANT ALL ON TABLE "from_fed_to_chain"."user_episode_state" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "from_fed_to_chain"."user_episode_state" TO "anon";
GRANT SELECT,INSERT,UPDATE ON TABLE "from_fed_to_chain"."user_episode_state" TO "authenticated";



GRANT SELECT("user_id"),INSERT("user_id"),UPDATE("user_id") ON TABLE "from_fed_to_chain"."user_episode_state" TO "anon";
GRANT SELECT("user_id"),INSERT("user_id"),UPDATE("user_id") ON TABLE "from_fed_to_chain"."user_episode_state" TO "authenticated";



GRANT SELECT("episode_id"),INSERT("episode_id"),UPDATE("episode_id") ON TABLE "from_fed_to_chain"."user_episode_state" TO "anon";
GRANT SELECT("episode_id"),INSERT("episode_id"),UPDATE("episode_id") ON TABLE "from_fed_to_chain"."user_episode_state" TO "authenticated";



GRANT SELECT("listened"),INSERT("listened"),UPDATE("listened") ON TABLE "from_fed_to_chain"."user_episode_state" TO "anon";
GRANT SELECT("listened"),INSERT("listened"),UPDATE("listened") ON TABLE "from_fed_to_chain"."user_episode_state" TO "authenticated";



GRANT SELECT("last_position_seconds"),INSERT("last_position_seconds"),UPDATE("last_position_seconds") ON TABLE "from_fed_to_chain"."user_episode_state" TO "anon";
GRANT SELECT("last_position_seconds"),INSERT("last_position_seconds"),UPDATE("last_position_seconds") ON TABLE "from_fed_to_chain"."user_episode_state" TO "authenticated";



GRANT INSERT("updated_at"),UPDATE("updated_at") ON TABLE "from_fed_to_chain"."user_episode_state" TO "anon";
GRANT INSERT("updated_at"),UPDATE("updated_at") ON TABLE "from_fed_to_chain"."user_episode_state" TO "authenticated";



GRANT ALL ON TABLE "from_fed_to_chain"."users" TO "service_role";



GRANT ALL ON TABLE "public"."daily_portfolio_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."daily_portfolio_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_portfolio_snapshots" TO "service_role";
GRANT SELECT ON TABLE "public"."daily_portfolio_snapshots" TO "readonly_user";
GRANT SELECT ON TABLE "public"."daily_portfolio_snapshots" TO "alpha_etl_user";



GRANT ALL ON TABLE "public"."job_logs" TO "anon";
GRANT ALL ON TABLE "public"."job_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."job_logs" TO "service_role";
GRANT SELECT ON TABLE "public"."job_logs" TO "readonly_user";
GRANT SELECT ON TABLE "public"."job_logs" TO "alpha_etl_user";



GRANT ALL ON TABLE "public"."jobs" TO "anon";
GRANT ALL ON TABLE "public"."jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."jobs" TO "service_role";
GRANT SELECT ON TABLE "public"."jobs" TO "readonly_user";
GRANT SELECT ON TABLE "public"."jobs" TO "alpha_etl_user";



GRANT SELECT,INSERT,REFERENCES,TRIGGER ON TABLE "public"."ledger_decision_events" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER ON TABLE "public"."ledger_decision_events" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,TRIGGER ON TABLE "public"."ledger_decision_events" TO "service_role";
GRANT SELECT ON TABLE "public"."ledger_decision_events" TO "readonly_user";
GRANT SELECT ON TABLE "public"."ledger_decision_events" TO "alpha_etl_user";



GRANT SELECT,INSERT,REFERENCES,TRIGGER ON TABLE "public"."ledger_execution_events" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER ON TABLE "public"."ledger_execution_events" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,TRIGGER ON TABLE "public"."ledger_execution_events" TO "service_role";
GRANT SELECT ON TABLE "public"."ledger_execution_events" TO "readonly_user";
GRANT SELECT ON TABLE "public"."ledger_execution_events" TO "alpha_etl_user";



GRANT SELECT,INSERT,REFERENCES,TRIGGER ON TABLE "public"."ledger_plan_events" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER ON TABLE "public"."ledger_plan_events" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,TRIGGER ON TABLE "public"."ledger_plan_events" TO "service_role";
GRANT SELECT ON TABLE "public"."ledger_plan_events" TO "readonly_user";
GRANT SELECT ON TABLE "public"."ledger_plan_events" TO "alpha_etl_user";



GRANT SELECT,INSERT,REFERENCES,TRIGGER ON TABLE "public"."ledger_signal_events" TO "anon";
GRANT SELECT,INSERT,REFERENCES,TRIGGER ON TABLE "public"."ledger_signal_events" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,TRIGGER ON TABLE "public"."ledger_signal_events" TO "service_role";
GRANT SELECT ON TABLE "public"."ledger_signal_events" TO "readonly_user";
GRANT SELECT ON TABLE "public"."ledger_signal_events" TO "alpha_etl_user";



GRANT ALL ON TABLE "public"."notification_settings" TO "anon";
GRANT ALL ON TABLE "public"."notification_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_settings" TO "service_role";
GRANT SELECT ON TABLE "public"."notification_settings" TO "readonly_user";
GRANT SELECT ON TABLE "public"."notification_settings" TO "alpha_etl_user";



GRANT ALL ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";
GRANT SELECT ON TABLE "public"."plans" TO "readonly_user";
GRANT SELECT ON TABLE "public"."plans" TO "alpha_etl_user";



GRANT ALL ON TABLE "public"."portfolio_category_trend_mv" TO "anon";
GRANT ALL ON TABLE "public"."portfolio_category_trend_mv" TO "authenticated";
GRANT ALL ON TABLE "public"."portfolio_category_trend_mv" TO "service_role";
GRANT SELECT ON TABLE "public"."portfolio_category_trend_mv" TO "readonly_user";
GRANT SELECT ON TABLE "public"."portfolio_category_trend_mv" TO "alpha_etl_user";



GRANT ALL ON TABLE "public"."regime_transitions_view" TO "anon";
GRANT ALL ON TABLE "public"."regime_transitions_view" TO "authenticated";
GRANT ALL ON TABLE "public"."regime_transitions_view" TO "service_role";
GRANT SELECT ON TABLE "public"."regime_transitions_view" TO "readonly_user";
GRANT SELECT ON TABLE "public"."regime_transitions_view" TO "alpha_etl_user";



GRANT ALL ON TABLE "public"."strategy_change_notification_state" TO "anon";
GRANT ALL ON TABLE "public"."strategy_change_notification_state" TO "authenticated";
GRANT ALL ON TABLE "public"."strategy_change_notification_state" TO "service_role";
GRANT SELECT ON TABLE "public"."strategy_change_notification_state" TO "readonly_user";
GRANT SELECT ON TABLE "public"."strategy_change_notification_state" TO "alpha_etl_user";



GRANT ALL ON TABLE "public"."strategy_saved_configs" TO "anon";
GRANT ALL ON TABLE "public"."strategy_saved_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."strategy_saved_configs" TO "service_role";
GRANT SELECT ON TABLE "public"."strategy_saved_configs" TO "readonly_user";
GRANT SELECT ON TABLE "public"."strategy_saved_configs" TO "alpha_etl_user";



GRANT ALL ON TABLE "public"."strategy_trade_history" TO "anon";
GRANT ALL ON TABLE "public"."strategy_trade_history" TO "authenticated";
GRANT ALL ON TABLE "public"."strategy_trade_history" TO "service_role";
GRANT SELECT ON TABLE "public"."strategy_trade_history" TO "readonly_user";
GRANT SELECT ON TABLE "public"."strategy_trade_history" TO "alpha_etl_user";



GRANT ALL ON SEQUENCE "public"."strategy_trade_history_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."strategy_trade_history_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."strategy_trade_history_id_seq" TO "service_role";
GRANT USAGE ON SEQUENCE "public"."strategy_trade_history_id_seq" TO "readonly_user";
GRANT SELECT ON SEQUENCE "public"."strategy_trade_history_id_seq" TO "alpha_etl_user";



GRANT ALL ON TABLE "public"."telegram_verification_tokens" TO "anon";
GRANT ALL ON TABLE "public"."telegram_verification_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."telegram_verification_tokens" TO "service_role";
GRANT SELECT ON TABLE "public"."telegram_verification_tokens" TO "readonly_user";
GRANT SELECT ON TABLE "public"."telegram_verification_tokens" TO "alpha_etl_user";



GRANT ALL ON TABLE "public"."user_crypto_wallets" TO "anon";
GRANT ALL ON TABLE "public"."user_crypto_wallets" TO "authenticated";
GRANT ALL ON TABLE "public"."user_crypto_wallets" TO "service_role";
GRANT SELECT ON TABLE "public"."user_crypto_wallets" TO "readonly_user";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."user_crypto_wallets" TO "alpha_etl_user";



GRANT ALL ON TABLE "public"."user_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."user_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_subscriptions" TO "service_role";
GRANT SELECT ON TABLE "public"."user_subscriptions" TO "readonly_user";
GRANT SELECT ON TABLE "public"."user_subscriptions" TO "alpha_etl_user";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";
GRANT SELECT ON TABLE "public"."users" TO "readonly_user";
GRANT SELECT ON TABLE "public"."users" TO "alpha_etl_user";



GRANT ALL ON TABLE "review_web"."content" TO "anon";
GRANT ALL ON TABLE "review_web"."content" TO "authenticated";
GRANT ALL ON TABLE "review_web"."content" TO "service_role";



GRANT ALL ON TABLE "review_web"."pipeline_jobs" TO "anon";
GRANT ALL ON TABLE "review_web"."pipeline_jobs" TO "authenticated";
GRANT ALL ON TABLE "review_web"."pipeline_jobs" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "alpha_raw" GRANT SELECT,USAGE ON SEQUENCES  TO "readonly_user";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "alpha_raw" GRANT SELECT ON TABLES  TO "readonly_user";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "alpha_raw" GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES  TO "alpha_etl_user";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT USAGE ON SEQUENCES  TO "readonly_user";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT ON SEQUENCES  TO "alpha_etl_user";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "readonly_user";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT ON TABLES  TO "readonly_user";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT ON TABLES  TO "alpha_etl_user";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "review_web" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "review_web" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "review_web" GRANT ALL ON SEQUENCES  TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "review_web" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "review_web" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "review_web" GRANT ALL ON TABLES  TO "service_role";
