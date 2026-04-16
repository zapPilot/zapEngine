BEGIN;

-- Add activity tracking to users table (updated by account-engine)
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP WITH TIME ZONE;

-- Add portfolio update tracking per wallet (updated by alpha-etl)
ALTER TABLE public.user_crypto_wallets
ADD COLUMN IF NOT EXISTS last_portfolio_update_at TIMESTAMP WITH TIME ZONE;

-- Index for efficient activity queries
CREATE INDEX IF NOT EXISTS idx_users_last_activity
ON public.users(last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_wallets_last_update
ON public.user_crypto_wallets(last_portfolio_update_at DESC);

-- Combined index for user + wallet lookup
CREATE INDEX IF NOT EXISTS idx_user_wallets_user_id_update
ON public.user_crypto_wallets(user_id, last_portfolio_update_at DESC);

COMMENT ON COLUMN public.users.last_activity_at IS
'Timestamp of last user activity (dashboard visit, API request, etc.). Updated by account-engine with 1-hour debouncing.';

COMMENT ON COLUMN public.user_crypto_wallets.last_portfolio_update_at IS
'Timestamp of last portfolio data update from DeBank API. Updated by alpha-etl after successful fetch.';

COMMIT;
