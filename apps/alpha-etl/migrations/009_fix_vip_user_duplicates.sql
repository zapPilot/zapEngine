-- Migration: Fix duplicate VIP users in get_users_wallets_by_plan_with_activity function
-- Issue: Cartesian product between user_subscriptions and user_crypto_wallets
-- Solution: Use DISTINCT ON to return one row per unique wallet
-- Date: 2025-12-29

-- Drop existing function
DROP FUNCTION IF EXISTS public.get_users_wallets_by_plan_with_activity(text);

-- Create fixed function with DISTINCT ON deduplication
CREATE OR REPLACE FUNCTION public.get_users_wallets_by_plan_with_activity(plan_name text)
RETURNS TABLE(user_id text, wallet text, last_activity_at timestamp with time zone, last_portfolio_update_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
  ORDER BY
    ucw.wallet,                          -- Required for DISTINCT ON
    us.starts_at DESC,                   -- Prefer most recent subscription
    u.last_activity_at DESC NULLS LAST;  -- Prefer active users
END;
$function$;

-- Add comment explaining the fix
COMMENT ON FUNCTION public.get_users_wallets_by_plan_with_activity(text) IS
'Returns unique wallets for users with specified plan.
Uses DISTINCT ON to prevent Cartesian product duplicates when users have multiple subscriptions.
Prioritizes most recent subscription and active users.';
