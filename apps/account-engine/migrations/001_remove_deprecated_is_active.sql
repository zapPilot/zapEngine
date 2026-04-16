-- Migration: Remove deprecated is_active column from users table
-- Date: 2026-01-04
-- Author: Claude Code
--
-- IMPORTANT: Apply this migration via Supabase Dashboard or using mcp__supabase__apply_migration
-- This migration is IRREVERSIBLE - the column will be dropped permanently
--
-- Background:
-- The is_active field has been deprecated in favor of timestamp-based activity tracking
-- using the last_activity_at field. The system now uses last_activity_at to determine
-- user activity status, which provides more granular tracking and automatic updates.
--
-- The SQL function get_users_wallets_by_plan_with_activity already uses last_activity_at
-- and does not filter by is_active at all.
--
-- This migration:
-- 1. Removes the deprecated is_active column from the users table
-- 2. Updates the last_activity_at column comment to clarify it's the primary activity indicator
--
-- Impact:
-- - Breaking change: API responses will no longer include is_active
-- - Frontend has been updated to remove is_active from Zod schemas
-- - Backend services have been updated to remove is_active filters
-- - Test fixtures have been updated across all codebases
--
-- Rollback (if needed before production):
-- ALTER TABLE public.users ADD COLUMN is_active BOOLEAN DEFAULT true;

-- Remove the deprecated is_active column
ALTER TABLE public.users
DROP COLUMN IF EXISTS is_active;

-- Update comment on last_activity_at to clarify it's the primary activity tracking field
COMMENT ON COLUMN public.users.last_activity_at IS
'Primary activity tracking field. Timestamp of last user activity (dashboard visit, API request, etc.).
Updated by account-engine with 1-hour debouncing. Replaces deprecated is_active boolean.
Used by alpha-etl via get_users_wallets_by_plan_with_activity() to determine which users to update.';
