/**
 * Shared example allocation for the landing page.
 *
 * Keep labels and weights in sync with the app's demo data — the landing
 * page must speak the app's language (see plan: portfolio-account narrative).
 * Pillar cards consume the matching design-token CSS variables (`--spy`,
 * `--btc`, `--usd`); `color` keeps the animated cockpit bar on the same palette.
 */
export const ALLOCATION_PILLARS = [
  {
    key: 'spy',
    label: 'S&P 500',
    tag: 'Trade into equities',
    weight: 42,
    color: '#d7dde7',
    symbols: ['SPY'],
  },
  {
    key: 'btc',
    label: 'BTC · ETH',
    tag: 'Trade into beta',
    weight: 38,
    color: '#f7931a',
    symbols: ['BTC', 'ETH'],
  },
  {
    key: 'usd',
    label: 'Stablecoins',
    tag: 'Trade into defense',
    weight: 20,
    color: '#2775ca',
    symbols: ['USDC'],
  },
] as const;
