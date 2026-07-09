-- Migration: Wallet ownership verification timestamp
-- Description: Add ownership_verified_at to user_crypto_wallets
-- Date: 2026-07-07
-- Part of: challenge-signature ownership proof (wallet control verified at bind time)
--
-- This migration is REVERSIBLE - includes rollback section at bottom
--
-- Background:
-- Wallet binding used to be a plain insert — linking a self-custody EOA to an
-- account was an unverified claim. Bindings that presented a valid signature
-- over the server-issued challenge are stamped here; observe-only wallets stay
-- NULL. Tier-S custody flows require a verified row.

-- ============================================================
-- 1. ADD ownership_verified_at COLUMN
-- ============================================================

ALTER TABLE user_crypto_wallets
  ADD COLUMN IF NOT EXISTS ownership_verified_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN user_crypto_wallets.ownership_verified_at IS
  'Set when the binding presented a valid challenge signature proving control of the wallet key. NULL = unverified / observe-only binding.';

-- ============================================================
-- ROLLBACK (manual)
-- ============================================================
-- ALTER TABLE user_crypto_wallets DROP COLUMN IF EXISTS ownership_verified_at;
