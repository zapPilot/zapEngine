-- Apply manually after the account-engine ownership backfill and before
-- deploying optional-signature wallet creation.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_users_wallets_by_ids(user_ids text[])
RETURNS TABLE(user_id text, wallet text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.get_users_wallets_by_plan(p_plan_code text)
RETURNS TABLE(user_id uuid, email text, wallet text)
LANGUAGE plpgsql
AS $function$
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
$function$;

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
    AND ucw.ownership_verified_at IS NOT NULL
  ORDER BY ucw.wallet, us.starts_at DESC, u.last_activity_at DESC NULLS LAST;
END;
$function$;

COMMENT ON FUNCTION public.get_users_wallets_by_plan(text) IS
'Returns only ownership-verified wallets for users with the specified plan.';
COMMENT ON FUNCTION public.get_users_wallets_by_ids(text[]) IS
'Returns only ownership-verified wallets for the specified users.';
COMMENT ON FUNCTION public.get_users_wallets_by_plan_with_activity(text) IS
'Returns unique ownership-verified wallets for active users with the specified plan, prioritizing the newest subscription and most active user.';

COMMIT;
