-- Migration: Strategy change notification state
-- Description: Create strategy_change_notification_state (one row per strategy)
-- Date: 2026-08-20
-- Part of: strategy-change Telegram notifications
--
-- This migration is REVERSIBLE - includes rollback section at bottom
--
-- Background:
-- The strategy-change notifier reads the committed backtest equity curve and
-- announces trade events on Telegram. The curve is a full-history artifact, so
-- the job needs to remember how far it has already announced or a rerun would
-- replay every historical trade. Storing the last announced event date — rather
-- than a per-user cursor — matches the notification itself: one broadcast per
-- strategy event, not one per user.
--
-- Written only by the job processor via service_role. No anon/authenticated
-- policy exists: this is bookkeeping, not user data.

-- ============================================================
-- 1. TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS strategy_change_notification_state (
  strategy_id TEXT PRIMARY KEY,
  last_event_date DATE NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. ROW LEVEL SECURITY (service-role only)
-- ============================================================
-- RLS on with no policy means anon and authenticated read nothing; service_role
-- bypasses RLS, which is the only access path the job needs.

ALTER TABLE strategy_change_notification_state ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON strategy_change_notification_state TO service_role;

-- ============================================================
-- 3. COMMENTS
-- ============================================================

COMMENT ON TABLE strategy_change_notification_state IS
  'Last equity-curve trade-event date already announced on Telegram, per strategy.';
COMMENT ON COLUMN strategy_change_notification_state.last_event_date IS
  'Events on or before this date are already announced; only later events notify.';

-- ============================================================
-- ROLLBACK (manual)
-- ============================================================
-- DROP TABLE IF EXISTS strategy_change_notification_state;
