-- Apply manually before 017_etl_only_verified_wallets.sql.
-- Grandfathered rows receive this deployment timestamp in bulk; it is not the
-- time at which an ownership signature was collected.
BEGIN;

UPDATE user_crypto_wallets
SET ownership_verified_at = now()
WHERE ownership_verified_at IS NULL;

COMMIT;
