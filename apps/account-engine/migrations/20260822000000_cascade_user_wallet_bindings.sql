-- Wallet bindings must be released atomically when their Zap Pilot account is
-- deleted so the wallet can be claimed by another account immediately.
ALTER TABLE user_crypto_wallets
  DROP CONSTRAINT IF EXISTS user_crypto_wallets_user_id_fkey;

ALTER TABLE user_crypto_wallets
  ADD CONSTRAINT user_crypto_wallets_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
