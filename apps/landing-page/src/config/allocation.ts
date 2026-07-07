/**
 * Shared example allocation for the landing page.
 *
 * Keep labels and weights in sync with the app's demo data — the landing
 * page must speak the app's language (see plan: portfolio-account narrative).
 * Colors are consumed as CSS variables from @zapengine/design-tokens
 * (`--spy`, `--btc`, `--usd`); never introduce animation-private colors.
 */
export const ALLOCATION_PILLARS = [
  { key: 'spy', label: 'S&P 500', tag: 'Trade into equities', weight: 42 },
  { key: 'btc', label: 'BTC · ETH', tag: 'Trade into beta', weight: 38 },
  { key: 'usd', label: 'Stablecoins', tag: 'Trade into defense', weight: 20 },
] as const;
