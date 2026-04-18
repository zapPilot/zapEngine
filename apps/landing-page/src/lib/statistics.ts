// Shared statistics constants for Hero and CTA components

export type StatType = 'text' | 'icons';

export interface Stat {
  label: string;
  value?: string;
  type: StatType;
  icons?: Array<{
    src: string;
    alt: string;
    name: string;
  }>;
}

// Shared core stats (used by both STATISTICS and LP_STATISTICS)
export const CORE_STATS: Stat[] = [
  {
    label: 'Total Value Locked',
    value: '$261k+',
    type: 'text',
  },
  {
    label: 'Market Regimes Monitored',
    value: '5',
    type: 'text',
  },
  {
    label: 'Core Assets',
    type: 'icons',
    icons: [
      { src: '/btc.webp', alt: 'Bitcoin', name: 'BTC' },
      { src: '/eth.webp', alt: 'Ethereum', name: 'ETH' },
      { src: '/usdc.webp', alt: 'USDC', name: 'USDC' },
    ],
  },
];

export const STATISTICS: Stat[] = [
  ...CORE_STATS,
  {
    label: 'Integrated Protocols',
    type: 'icons',
    icons: [
      { src: '/protocols/morpho.webp', alt: 'Morpho', name: 'Morpho' },
      { src: '/protocols/gmx-v2.webp', alt: 'GMX v2', name: 'GMX' },
      { src: '/protocols/hyperliquid.webp', alt: 'Hyperliquid', name: 'Hyperliquid' },
      { src: '/protocols/aster.webp', alt: 'Aster', name: 'Aster' },
    ],
  },
];
