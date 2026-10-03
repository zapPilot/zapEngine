/**
 * Every claim the calculator pitch puts on screen or in narration. facts.test.ts
 * pins each value to apps/landing-page/src/data/verifiable-strategy.json (and
 * recomputes the CREATE2 address), so a redeploy or data refresh turns the test
 * red instead of shipping a video that contradicts the product.
 *
 * Claim boundary: the 2025-10-18 recording matches the Python backtest. Never
 * claim full Python/EVM parity, and quote the move as a share of the
 * portfolio, not dollars (the published USD amounts differ between sources).
 */
export const facts = {
  url: 'https://www.zap-pilot.org/track-record/calculator/',
  displayUrl: 'zap-pilot.org/track-record/calculator',
  network: 'Arbitrum Sepolia',
  chainId: 421614,
  address: '0x074A6d6497Af23158F946c7D571b1B627f3411Cd',
  runtimeCodehash:
    '0xc34735d87c23ebd06260a554d0e5a15f8d6616c16b3d73c296ee29cd837acf50',
  deployTransaction:
    '0xf2ae5518b320f1914f99e89f1b3fb8ee226f809d4aca7ee859db27f15d3c7559',
  deployBlock: 315219939,
  factory: '0x4e59b44847b379578588920cA78FbF26c0B4956C',
  saltLabel: 'zap-pilot/research/dma-cross-down-slice/v1',
  salt: '0x7c24e4a91e53631425be8ece30d071af47acb3d4af8eb93587e74b692c307ef2',
  compiler: '0.4.3',
  sourcify: 'verified',
  contractFile: 'dma_cross_down_slice.vy',
  rulesCovered: 1,
  rulesTotal: 6,
  example: {
    date: '2025-10-18',
    btc: {
      /** The price cell at rest: two decimals. */
      display: '106,443.61',
      /** The same cell while editing: every digit that was supplied. */
      price: '106443.61194985',
      /** What the contract receives: price × 10^18 as a uint256. */
      priceWad: '106443611949850000000000',
      dma: '107641.66727525',
    },
    /** Percent of the portfolio, BTC / ETH / SPY / Stable, two decimals. */
    before: { BTC: 13.39, ETH: 0.35, SPY: 3.88, Stable: 82.38 },
    after: { BTC: 0, ETH: 0, SPY: 3.88, Stable: 96.12 },
    /** The published backtest event's share of the portfolio moved. */
    movedPercent: 13.75,
    verdict: 'Move BTC and ETH to stablecoins.',
    reason:
      'BTC crossed below its 200-day average. A BTC trigger also exits ETH.',
    match: 'Same result as the Python backtest',
  },
  hold: {
    scenario: 'BTC holds above its average',
    verdict: 'Hold. No asset crossed below its 200-day average.',
  },
} as const;

/** `0x074A…11Cd`: the short form used in titles and lower thirds. */
export function shortHex(value: string, head = 6, tail = 4): string {
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}
