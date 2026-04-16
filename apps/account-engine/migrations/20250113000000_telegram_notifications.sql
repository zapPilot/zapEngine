-- Migration: Telegram Notifications - Database Foundations
-- Description: Create notification_settings and telegram_verification_tokens tables
-- Date: 2025-01-13
-- Part of: Telegram Integration Phase 1
--
-- This migration is REVERSIBLE - includes rollback section at bottom
--
-- Background:
-- Setting up multi-channel notification infrastructure for Telegram alerts.
-- Users will receive notifications when portfolio drift exceeds threshold.
-- Using token-based secure connection flow to prevent URL leakage attacks.

-- ============================================================
-- 1. CREATE notification_settings TABLE
-- ============================================================
-- Stores multi-channel notification preferences (telegram, email, webhook)
-- Primary key: (user_id, channel_type) allows one config per channel per user

CREATE TABLE IF NOT EXISTS notification_settings (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, channel_type)
);

-- Add constraint to validate channel types
ALTER TABLE notification_settings
ADD CONSTRAINT valid_channel_types
CHECK (channel_type IN ('email', 'telegram', 'webhook'));

-- Index for batch job performance (queries only enabled telegram users)
-- Partial index reduces size and improves query speed
CREATE INDEX IF NOT EXISTS idx_active_telegram_users
  ON notification_settings(user_id)
  WHERE channel_type = 'telegram' AND is_enabled = true;

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_notification_settings_user_id
  ON notification_settings(user_id);

-- Table comments for documentation
COMMENT ON TABLE notification_settings IS
  'Multi-channel notification configuration. Supports telegram, email, and webhook channels.';

COMMENT ON COLUMN notification_settings.config IS
  'Channel-specific configuration. For telegram: {"chat_id": "123456789", "rebalance_threshold": 0.05}';

-- ============================================================
-- 2. CREATE telegram_verification_tokens TABLE
-- ============================================================
-- Stores temporary tokens for secure Telegram connection flow
-- Tokens expire after 10 minutes and are single-use

CREATE TABLE IF NOT EXISTS telegram_verification_tokens (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ
);

-- Check constraint: token must be non-empty
ALTER TABLE telegram_verification_tokens
ADD CONSTRAINT token_not_empty
CHECK (char_length(token) > 0);

-- Check constraint: expires_at must be in the future at creation
ALTER TABLE telegram_verification_tokens
ADD CONSTRAINT expires_in_future
CHECK (expires_at > created_at);

-- Index for token validation (frequent query: token + expiry check)
CREATE INDEX IF NOT EXISTS idx_telegram_tokens_validation
  ON telegram_verification_tokens(token, expires_at)
  WHERE used_at IS NULL;

-- Index for cleanup queries (find expired tokens)
CREATE INDEX IF NOT EXISTS idx_telegram_tokens_expires_at
  ON telegram_verification_tokens(expires_at)
  WHERE used_at IS NULL;

-- Index for rate limiting (check recent tokens per user)
CREATE INDEX IF NOT EXISTS idx_telegram_tokens_user_rate_limit
  ON telegram_verification_tokens(user_id, created_at DESC);

-- Table comments
COMMENT ON TABLE telegram_verification_tokens IS
  'Temporary tokens for secure Telegram connection. Expire after 10 minutes, single-use.';

COMMENT ON COLUMN telegram_verification_tokens.used_at IS
  'Timestamp when token was consumed. NULL = unused. Set when user completes connection.';

-- ============================================================
-- 3. CREATE CLEANUP FUNCTION
-- ============================================================
-- Function to remove expired tokens (called by scheduled job)

CREATE OR REPLACE FUNCTION cleanup_expired_telegram_tokens()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
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

COMMENT ON FUNCTION cleanup_expired_telegram_tokens() IS
  'Removes expired and old used tokens. Returns count of deleted rows. Run daily via cron.';

-- ============================================================
-- 4. ADD OPTIONAL TELEGRAM USERNAME TO USERS
-- ============================================================
-- Store Telegram username for audit trail (optional, nullable)

ALTER TABLE users
ADD COLUMN IF NOT EXISTS telegram_username TEXT;

COMMENT ON COLUMN users.telegram_username IS
  'Telegram username (@handle) for audit purposes. Stored when user connects Telegram.';

-- ============================================================
-- 5. GRANT PERMISSIONS
-- ============================================================
-- Grant service role access to new tables and functions

-- Grant select/insert/update/delete on notification_settings
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_settings TO service_role;
GRANT SELECT ON notification_settings TO anon, authenticated;

-- Grant select/insert/update/delete on telegram_verification_tokens
GRANT SELECT, INSERT, UPDATE, DELETE ON telegram_verification_tokens TO service_role;

-- Grant execute on cleanup function
GRANT EXECUTE ON FUNCTION cleanup_expired_telegram_tokens() TO service_role;

-- ============================================================
-- ROLLBACK SECTION
-- ============================================================
-- Run these commands if you need to reverse this migration:
--
-- DROP TABLE IF EXISTS telegram_verification_tokens CASCADE;
-- DROP TABLE IF EXISTS notification_settings CASCADE;
-- DROP FUNCTION IF EXISTS cleanup_expired_telegram_tokens();
-- ALTER TABLE users DROP COLUMN IF EXISTS telegram_username;
