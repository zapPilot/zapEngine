/**
 * Demo data for disconnected previews and UI fallback states. Connected data
 * hooks should prefer live app-core/account-engine sources and render dashes
 * when no clean source exists.
 */

export type ChainKey = 'ethereum' | 'arbitrum' | 'base';

export interface ChainMeta {
  key: ChainKey;
  label: string;
  color: string;
}

export const CHAINS: Record<ChainKey, ChainMeta> = {
  ethereum: { key: 'ethereum', label: 'Ethereum', color: '#6f7691' },
  arbitrum: { key: 'arbitrum', label: 'Arbitrum', color: '#28a0f0' },
  base: { key: 'base', label: 'Base', color: '#2151f5' },
};

export interface DemoAsset {
  symbol: string;
  name: string;
  usdValue: number | null;
  amountLabel: string;
  chains: ChainKey[];
  /** Icon background + glyph used by TokenIcon. */
  iconBg: string;
  glyph: string;
}

export interface DemoData {
  account: {
    label: string;
    address: string;
    connected: boolean;
  };
  home: {
    totalBalance: number | null;
    changePct: number | null;
    changeUsdToday: number | null;
    sparkline: number[];
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
  activity: ActivityGroup[];
}

export type MetricTone = 'neutral' | 'positive' | 'negative' | 'accent';

export type ActivityKind =
  | 'invest'
  | 'rebalance'
  | 'yield'
  | 'deposit'
  | 'withdraw'
  | 'strategy-update';

export type ActivityStatus = 'Completed' | 'Settled' | 'Applied';

export interface ActivityStep {
  label: string;
  done: boolean;
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
  steps?: ActivityStep[];
  /** Legacy flag kept so older activity rows can still be typed if reintroduced. */
  demoOnly?: boolean;
}

export interface ActivityGroup {
  label: string;
  events: ActivityEvent[];
}

const usdcIcon = { iconBg: '#2775ca', glyph: '$' };
const ethIcon = { iconBg: '#2a2a30', glyph: 'Ξ' };
const wbtcIcon = { iconBg: '#f7931a', glyph: '₿' };

export const DEMO: DemoData = {
  account: {
    label: 'Main Wallet',
    address: '0xf8a6000000000000000000000000000000000f940',
    connected: true,
  },
  home: {
    totalBalance: 24_815.6,
    changePct: 2.6,
    changeUsdToday: 612.4,
    sparkline: [42, 44, 38, 41, 33, 36, 27, 31, 23, 27, 17, 22, 13, 11, 9].map(
      (y) => 54 - y,
    ),
    assets: [
      {
        symbol: 'USDC',
        name: 'USD Coin',
        usdValue: 12_480.5,
        amountLabel: '12,480.50',
        chains: ['base', 'arbitrum', 'ethereum'],
        ...usdcIcon,
      },
      {
        symbol: 'ETH',
        name: 'Ethereum',
        usdValue: 9_420.0,
        amountLabel: '2.60 ETH',
        chains: ['ethereum', 'base', 'arbitrum'],
        ...ethIcon,
      },
      {
        symbol: 'WBTC',
        name: 'Wrapped Bitcoin',
        usdValue: 2_915.1,
        amountLabel: '0.030 WBTC',
        chains: ['arbitrum', 'ethereum'],
        ...wbtcIcon,
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
      { label: 'Total return', value: '+16.7%', tone: 'positive' },
      { label: 'Current APY', value: '9.2%', tone: 'accent' },
      { label: '7D return', value: '+1.8%', tone: 'positive' },
      { label: '30D return', value: '+4.2%', tone: 'positive' },
      { label: 'Realized yield', value: '$642.10', tone: 'neutral' },
      { label: 'Max drawdown', value: '−6.1%', tone: 'negative' },
      { label: 'Fees paid', value: '$28.40', tone: 'neutral' },
      { label: 'Gas saved', value: '$54.00', tone: 'positive' },
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
  activity: [],
};

export const ACTIVITY_FILTERS = [
  'All',
  'Deposits',
  'Rebalances',
  'Yield',
] as const;

export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number];
