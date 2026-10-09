/**
 * Demo data for disconnected previews and UI fallback states. Connected data
 * hooks should prefer live app-core/account-engine sources and render dashes
 * when no clean source exists.
 */

import { tokens } from '@zapengine/design-tokens/tokens';

import type { DemoAsset, MetricTone } from '@/integration/portfolioTypes';
import type { DailyValuePoint } from '@/integration/portfolioMetrics';

const DEMO_MARKET_ETH_SHARE = 0.6;
const DEMO_MARKET_BTC_SHARE = 0.15;
const DEMO_PROTOCOL_DAILY_USD = 4.2;

/**
 * Give the demo chart the same attribution shape live data carries, so the
 * disconnected preview shows the breakdown instead of an empty tooltip. The
 * pieces are derived from each day's own change, so they always add up.
 */
function buildDemoTrendPoints(values: number[]): DailyValuePoint[] {
  return values.map((total_value_usd, index): DailyValuePoint => {
    const point: DailyValuePoint = {
      date: `2026-08-${String(index + 8).padStart(2, '0')}`,
      total_value_usd,
      categories: [{ assets_usd: total_value_usd + 1_200, debt_usd: 1_200 }],
    };
    const previous = values[index - 1];
    if (previous === undefined) return point;

    const change = total_value_usd - previous;
    const market = change * (DEMO_MARKET_ETH_SHARE + DEMO_MARKET_BTC_SHARE);
    return {
      ...point,
      attribution: [
        {
          kind: 'market',
          label: 'ETH',
          valueUsd: change * DEMO_MARKET_ETH_SHARE,
        },
        {
          kind: 'market',
          label: 'BTC',
          valueUsd: change * DEMO_MARKET_BTC_SHARE,
        },
        { kind: 'protocol', label: 'Aave', valueUsd: DEMO_PROTOCOL_DAILY_USD },
        {
          kind: 'residual',
          valueUsd: change - market - DEMO_PROTOCOL_DAILY_USD,
        },
      ],
    };
  });
}

export interface DemoData {
  account: {
    label: string;
    address: string;
    connected: boolean;
  };
  home: {
    totalBalance: number | null;
    latestChangePct: number | null;
    latestChangeUsd: number | null;
    latestSnapshotDate: string | null;
    trendPoints: DailyValuePoint[];
    assets: DemoAsset[];
    sleeveAllocation: {
      btc: number;
      eth: number;
      spy: number;
      stable: number;
      alt: number;
    };
  };
  /** The Home strategy card's demo state. */
  strategy: {
    quote: string;
    /** Sentiment marker position 0–100 (fear → greed). */
    sentiment: number | null;
  };
  portfolio: {
    positionValue: number;
    changePct: number;
    changeUsdAllTime: number;
    changePctToday: number;
    metrics: { label: string; value: string; tone: MetricTone }[];
    allocation: { label: string; pct: number; color: string }[];
  };
}

export const DEMO: DemoData = {
  account: {
    label: 'Main Wallet',
    address: '0xf8a6000000000000000000000000000000000f940',
    connected: true,
  },
  home: {
    totalBalance: 24_815.6,
    sleeveAllocation: {
      btc: 0.05,
      eth: 0.205,
      spy: 0.477,
      stable: 0.268,
      alt: 0,
    },
    latestChangePct: 2.6,
    latestChangeUsd: 612.4,
    latestSnapshotDate: '2026-08-22',
    trendPoints: buildDemoTrendPoints([
      22_100, 22_250, 21_980, 22_330, 22_020, 22_460, 22_180, 22_760, 22_540,
      23_050, 22_830, 23_620, 23_950, 24_203.2, 24_815.6,
    ]),
    assets: [
      {
        symbol: 'USDC',
        name: 'USD Coin',
        usdValue: 12_480.5,
        amountLabel: '12,480.50',
        chains: ['base', 'arbitrum', 'ethereum'],
      },
      {
        symbol: 'ETH',
        name: 'Ethereum',
        usdValue: 9_420.0,
        amountLabel: '2.60 ETH',
        chains: ['ethereum', 'base', 'arbitrum'],
      },
      {
        symbol: 'WBTC',
        name: 'Wrapped Bitcoin',
        usdValue: 2_915.1,
        amountLabel: '0.030 WBTC',
        chains: ['arbitrum', 'ethereum'],
      },
    ],
  },
  strategy: {
    quote: 'Reference strategy philosophy: buy in fear, defend in greed.',
    sentiment: 34,
  },
  portfolio: {
    positionValue: 12_840.2,
    changePct: 16.7,
    changeUsdAllTime: 1_840.2,
    changePctToday: 0.4,
    metrics: [
      { label: 'Value change', value: '+16.7%', tone: 'positive' },
      { label: 'Current APY', value: '9.2%', tone: 'neutral' },
      { label: '7D value change', value: '+1.8%', tone: 'positive' },
      { label: '30D value change', value: '+4.2%', tone: 'positive' },
      { label: 'Max drawdown', value: '−6.1%', tone: 'negative' },
    ],
    allocation: [
      { label: 'Stables', pct: 35, color: tokens.sleeve.night.stable },
      { label: 'ETH', pct: 24, color: tokens.sleeve.night.eth },
      { label: 'BTC', pct: 20, color: tokens.sleeve.night.btc },
      { label: 'DeFi yield', pct: 21, color: tokens.sleeve.night.alt },
    ],
  },
};
