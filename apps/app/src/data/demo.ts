/**
 * Demo data for disconnected previews and UI fallback states. Connected data
 * hooks should prefer live app-core/account-engine sources and render dashes
 * when no clean source exists.
 */

import type { AllocationCategoryKey } from '@zapengine/app-core/lib/domain/allocationCategories';

import type { DailyValuePoint } from '@/integration/portfolioMetrics';

export type ChainKey = 'ethereum' | 'arbitrum' | 'base';

export interface DemoAsset {
  symbol: string;
  name: string;
  usdValue: number | null;
  amountLabel: string;
  chains: ChainKey[];
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
    sparkline: number[];
    trendPoints: DailyValuePoint[];
    assets: DemoAsset[];
  };
  strategy: {
    estApyLabel: string;
    quote: string;
    marketModeLabel: string;
    /** Allocation pillars for the home strategy card (flex weights). */
    pillars: { label: string; weight: number; color: string }[];
    backtest: {
      returnLabel: string;
      vsBtcLabel: string;
      vsEthLabel: string;
      metrics: { label: string; value: string; tone: MetricTone }[];
      currentModeLabel: string;
      allocation: { label: string; pct: number; color: string }[];
      /** Sentiment marker position 0–100 (fear → greed). */
      sentiment: number | null;
    };
  };
  portfolio: {
    positionValue: number;
    changePct: number;
    changeUsdAllTime: number;
    changePctToday: number;
    metrics: { label: string; value: string; tone: MetricTone }[];
    allocation: { label: string; pct: number; color: string }[];
    lastRebalancedLabel: string;
  };
  activitySummary: ActivityCategoryFlow[];
  activity: ActivityGroup[];
}

export type MetricTone = 'neutral' | 'positive' | 'negative' | 'accent';

export type ActivityKind =
  | 'invest'
  | 'rebalance'
  | 'yield'
  | 'deposit'
  | 'withdraw'
  | 'contract-interaction'
  | 'strategy-update';

export type ActivityStatus = 'Completed' | 'Settled' | 'Applied' | 'Failed';

export interface ActivityStep {
  label: string;
  done: boolean;
}

/** Net movement of one allocation category inside an activity event. */
export interface ActivityCategoryDelta {
  category: AllocationCategoryKey;
  /** Net USD when the indexer priced the transfers; token-only otherwise. */
  usdNet: number | null;
  /** Pre-composed token-denominated label, e.g. `+5.25 USDC · −0.002 WBTC`. */
  label: string;
}

/** Per-category net flow across the loaded feed, for the summary card. */
export interface ActivityCategoryFlow extends ActivityCategoryDelta {
  /** Share (0..1) of feed events touching this category. */
  share: number;
}

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  title: string;
  amountLabel?: string;
  amountTone?: MetricTone;
  status: ActivityStatus;
  meta: string;
  time: string;
  /** Dominant allocation category — drives the row's category accent. */
  category?: AllocationCategoryKey;
  categoryDeltas?: ActivityCategoryDelta[];
  /** Number of on-chain transactions represented by this event. */
  txCount?: number;
  chain?: ChainKey;
  /** Transaction hash when the event maps to exactly one on-chain transaction. */
  txHash?: string;
  /** Moralis-decoded method label when available. */
  methodLabel?: string;
  /** Counterparty protocol/entity label. Known protocols resolve to brand marks. */
  protocol?: string;
  /** Native-chain transaction fee, preformatted for the activity card footer. */
  gasFeeLabel?: string;
  /** Primary token, retained for filtering/semantic summaries. */
  tokenSymbol?: string;
  steps?: ActivityStep[];
}

export interface ActivityGroup {
  label: string;
  events: ActivityEvent[];
}

export const DEMO: DemoData = {
  account: {
    label: 'Main Wallet',
    address: '0xf8a6000000000000000000000000000000000f940',
    connected: true,
  },
  home: {
    totalBalance: 24_815.6,
    latestChangePct: 2.6,
    latestChangeUsd: 612.4,
    latestSnapshotDate: '2026-08-22',
    sparkline: [42, 44, 38, 41, 33, 36, 27, 31, 23, 27, 17, 22, 13, 11, 9].map(
      (y) => 54 - y,
    ),
    trendPoints: [
      22_100, 22_250, 21_980, 22_330, 22_020, 22_460, 22_180, 22_760, 22_540,
      23_050, 22_830, 23_620, 23_950, 24_203.2, 24_815.6,
    ].map((total_value_usd, index) => ({
      date: `2026-08-${String(index + 8).padStart(2, '0')}`,
      total_value_usd,
      categories: [{ assets_usd: total_value_usd + 1_200, debt_usd: 1_200 }],
    })),
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
    estApyLabel: '6–12%',
    quote: 'Buy in fear. Defend in greed.',
    marketModeLabel: 'Market mode · Cautious — defensive tilt',
    pillars: [
      { label: 'Equities', weight: 5, color: 'var(--spy)' },
      { label: 'Crypto', weight: 3, color: 'var(--btc)' },
      { label: 'Stables', weight: 4, color: 'var(--usd)' },
    ],
    backtest: {
      returnLabel: '+147.2%',
      vsBtcLabel: 'vs BTC +98%',
      vsEthLabel: 'vs ETH +61%',
      metrics: [
        { label: 'CAGR', value: '+38.4%', tone: 'positive' },
        { label: 'Max drawdown', value: '−17.2%', tone: 'negative' },
        { label: 'Volatility', value: '24.1%', tone: 'neutral' },
        { label: 'Sharpe', value: '1.84', tone: 'accent' },
        { label: 'Sortino', value: '2.31', tone: 'accent' },
        { label: 'Win rate', value: '63%', tone: 'neutral' },
        { label: 'Worst month', value: '−9.4%', tone: 'negative' },
        { label: 'Best month', value: '+18.6%', tone: 'positive' },
      ],
      currentModeLabel: 'Cautious · defensive tilt',
      allocation: [
        { label: 'Equities', pct: 40, color: 'var(--spy)' },
        { label: 'Crypto', pct: 25, color: 'var(--btc)' },
        { label: 'Stables', pct: 35, color: 'var(--usd)' },
      ],
      sentiment: 34,
    },
  },
  portfolio: {
    positionValue: 12_840.2,
    changePct: 16.7,
    changeUsdAllTime: 1_840.2,
    changePctToday: 0.4,
    metrics: [
      { label: 'Value change', value: '+16.7%', tone: 'positive' },
      { label: 'Current APY', value: '9.2%', tone: 'accent' },
      { label: '7D value change', value: '+1.8%', tone: 'positive' },
      { label: '30D value change', value: '+4.2%', tone: 'positive' },
      { label: 'Max drawdown', value: '−6.1%', tone: 'negative' },
    ],
    allocation: [
      { label: 'Stables', pct: 35, color: 'var(--usd)' },
      { label: 'ETH', pct: 24, color: 'var(--spy)' },
      { label: 'BTC', pct: 20, color: 'var(--btc)' },
      { label: 'DeFi yield', pct: 21, color: 'var(--accent)' },
    ],
    lastRebalancedLabel:
      'Auto-managed by Zap Strategy · last rebalanced 2 days ago',
  },
  activitySummary: [
    { category: 'btc', usdNet: 1240, label: '+0.0107 CBBTC', share: 0.2 },
    { category: 'stable', usdNet: 460, label: '+460 USDC', share: 0.6 },
    { category: 'eth', usdNet: -150, label: '−0.045 ETH', share: 0.2 },
  ],
  activity: [
    {
      label: 'Today',
      events: [
        {
          id: 'demo-rebalance-burst',
          kind: 'rebalance',
          title: 'Rebalanced portfolio',
          amountLabel: '+$1,240.00',
          amountTone: 'positive',
          status: 'Completed',
          meta: 'Arbitrum · 32 transactions',
          time: '4m',
          category: 'btc',
          categoryDeltas: [
            { category: 'btc', usdNet: 1240, label: '+0.0107 CBBTC' },
            { category: 'stable', usdNet: -1240, label: '−1,240 USDC' },
          ],
          txCount: 32,
          chain: 'arbitrum',
          txHash: '0x9b6d0000000000000000000000000000000040a6',
          methodLabel: 'multicall',
          protocol: 'GMX V2',
          gasFeeLabel: '< 0.0001 ETH',
          tokenSymbol: 'CBBTC',
        },
        {
          id: 'demo-deposit',
          kind: 'deposit',
          title: 'Received USDC',
          amountLabel: '+$2,500.00',
          amountTone: 'positive',
          status: 'Completed',
          meta: 'Base',
          time: '1h',
          category: 'stable',
          categoryDeltas: [
            { category: 'stable', usdNet: 2500, label: '+2,500 USDC' },
          ],
          chain: 'base',
          txHash: '0xa467000000000000000000000000000000006bc9',
          protocol: 'Morpho',
          gasFeeLabel: '< 0.0001 ETH',
          tokenSymbol: 'USDC',
        },
      ],
    },
    {
      label: 'This week',
      events: [
        {
          id: 'demo-failed-send',
          kind: 'withdraw',
          title: 'Sent ETH',
          amountLabel: '−$150.00',
          amountTone: 'negative',
          status: 'Failed',
          meta: 'Arbitrum',
          time: '3d',
          category: 'eth',
          categoryDeltas: [
            { category: 'eth', usdNet: -150, label: '−0.045 ETH' },
          ],
          chain: 'arbitrum',
          txHash: '0x10e4000000000000000000000000000000004be8',
          protocol: 'Aave V3',
          gasFeeLabel: '< 0.0001 ETH',
          tokenSymbol: 'ETH',
        },
      ],
    },
    {
      label: 'Earlier',
      events: [
        {
          id: 'demo-withdraw',
          kind: 'withdraw',
          title: 'Sent USDC',
          amountLabel: '−$800.00',
          amountTone: 'negative',
          status: 'Completed',
          meta: 'Base',
          time: '2w',
          category: 'stable',
          categoryDeltas: [
            { category: 'stable', usdNet: -800, label: '−800 USDC' },
          ],
          chain: 'base',
          txHash: '0xd47900000000000000000000000000000000f020',
          protocol: 'Ondo Finance',
          gasFeeLabel: '0.00012 ETH',
          tokenSymbol: 'USDC',
        },
      ],
    },
  ],
};

export type ActivityFilter = 'All' | AllocationCategoryKey;

export const ACTIVITY_FILTERS = [
  'All',
  'btc',
  'eth',
  'spy',
  'stable',
  'alt',
] as const satisfies readonly ActivityFilter[];
