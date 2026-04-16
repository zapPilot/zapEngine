-- Migration: Add Hyperliquid HLP vault support to stablecoin category
-- Description: HLP (Hyperliquidity Provider) vaults use USDC as collateral
--              and should be categorized as stablecoins for portfolio analytics

CREATE OR REPLACE FUNCTION public.classify_token_category(symbol text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
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
$function$;
