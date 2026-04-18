// LP Pool statistics - alternative version with LP pairs
// This is a variation showing LP pools instead of just core assets

import { CORE_STATS, type Stat } from './statistics';

export const LP_STATISTICS: Stat[] = [
  ...CORE_STATS,
  {
    label: 'Active LP Pairs',
    type: 'icons',
    icons: [
      { src: '/btc.webp', alt: 'BTC-USDC LP', name: 'BTC-USDC' },
      { src: '/eth.webp', alt: 'ETH-USDC LP', name: 'ETH-USDC' },
    ],
  },
];
