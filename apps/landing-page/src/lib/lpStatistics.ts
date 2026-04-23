import { CORE_STATS, type Stat } from './statistics';

const ACTIVE_LP_PAIRS_STAT: Stat = {
  label: 'Active LP Pairs',
  type: 'icons',
  icons: [
    { src: '/btc.webp', alt: 'BTC-USDC LP pair', name: 'BTC-USDC' },
    { src: '/eth.webp', alt: 'ETH-USDC LP pair', name: 'ETH-USDC' },
  ],
};

export const LP_STATISTICS: Stat[] = [...CORE_STATS, ACTIVE_LP_PAIRS_STAT];
