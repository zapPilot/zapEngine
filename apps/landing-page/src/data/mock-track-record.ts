/**
 * Placeholder track-record data for the /track-record page.
 *
 * No live IPFS snapshot has been published yet (public/track-record-meta.json
 * has an empty latestSnapshotCid), so the whole page renders empty. This module
 * seeds every tab with a demo dataset built from the real committed backtest
 * curve (equity-curve.json) so the UI can be reviewed end-to-end.
 *
 * Self-retiring: useTrackRecord only falls back to this when the real meta has
 * no latestSnapshotCid. The moment a real snapshot is published, the live path
 * takes over and this data is never read. The demo is surfaced honestly via the
 * "Demo data" badge (see track-record layout) — fabricated returns must not read
 * as live. Set NEXT_PUBLIC_TRACK_RECORD_MOCK=0 to force it off.
 *
 * Values are computed with the exact formulas track-record-accessor's
 * verifyPerformanceMetrics uses, so on-page verification passes cleanly.
 */
import type { DailySnapshot, Position } from '@zapengine/types/strategy';
import type { SnapshotHistoryEntry } from '@/data/track-record-accessor';
import equityCurveRaw from '@/data/equity-curve.json';

const STRATEGY_ID = 'dma_fgi_portfolio_rules';
const STRATEGY_VERSION = 'v1';
const SCHEMA_VERSION = '1';
const BASE_CAPITAL = 10_000; // matches strategy-snapshot.json total_capital
const MODEL_WALLET = '0x1111111111111111111111111111111111111111';
const MAINNET = 1;
const REBALANCE_EVERY = 21; // ~monthly rebalance cadence over the daily series

/** Three-pillar model portfolio (weights mirror src/config/allocation.ts). */
const PILLARS = [
  {
    asset: 'SPY',
    protocol: 'Ondo',
    tokenAddress: '0x96F6eF951840721AdBF46Ac996b59E0235CB985C',
    weight: 42,
    price: 1.08,
    amountDp: 2,
    pricingSource: 'Ondo NAV',
  },
  {
    asset: 'BTC',
    protocol: 'Aave',
    tokenAddress: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    weight: 24,
    price: 95_000,
    amountDp: 6,
    pricingSource: 'Chainlink',
  },
  {
    asset: 'ETH',
    protocol: 'Lido',
    tokenAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    weight: 14,
    price: 3_500,
    amountDp: 4,
    pricingSource: 'Chainlink',
  },
  {
    asset: 'USDC',
    protocol: 'Morpho',
    tokenAddress: '0xA0b86991c6218b36c1d19D4a2E9Eb0cE3606eB48',
    weight: 20,
    price: 1,
    amountDp: 2,
    pricingSource: 'Chainlink',
  },
] as const;

interface CurvePoint {
  date: string;
  value: number;
}

const equityCurve = equityCurveRaw as {
  series: Array<{ id: string; values: CurvePoint[] }>;
};

function seriesById(id: string): CurvePoint[] {
  return equityCurve.series.find((s) => s.id === id)?.values ?? [];
}

function signed(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/** Deterministic 0x + 64 hex from a seed (no Math.random → stable across renders). */
function pseudoHash(seed: string): string {
  const hex = '0123456789abcdef';
  // FNV-1a seed, then xorshift32 to spread bits across the whole word.
  let x = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    x ^= seed.charCodeAt(i);
    x = Math.imul(x, 16777619) >>> 0;
  }
  let out = '';
  for (let w = 0; w < 8; w++) {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    for (let nibble = 7; nibble >= 0; nibble--) {
      out += hex[(x >>> (nibble * 4)) & 0xf];
    }
  }
  return `0x${out}`;
}

function cidFor(index: number): string {
  return `bafkreidemotrackrecordsnapshot${String(index).padStart(5, '0')}`;
}

function positionsForNav(navUsd: number): Position[] {
  return PILLARS.map((pillar) => {
    const valueUsd = (navUsd * pillar.weight) / 100;
    return {
      chainId: MAINNET,
      protocol: pillar.protocol,
      asset: pillar.asset,
      tokenAddress: pillar.tokenAddress,
      amount: (valueUsd / pillar.price).toFixed(pillar.amountDp),
      valueUsd: valueUsd.toFixed(2),
      weight: `${pillar.weight.toFixed(2)}%`,
      pricingSource: pillar.pricingSource,
    };
  });
}

function buildEntries(): SnapshotHistoryEntry[] {
  const strategy = seriesById('strategy');
  const dca = seriesById('dca');
  if (strategy.length === 0) return [];

  // Use the full daily series so computePerformanceSummary (which treats one
  // snapshot as one day) annualizes over the real ~500-day window.
  const points = strategy.map((point, i) => ({
    date: point.date,
    value: point.value,
    dca: dca[i]?.value ?? point.value,
  }));

  let peak = points[0]!.value;

  return points.map((point, i): SnapshotHistoryEntry => {
    const navUsd = (point.value / 100) * BASE_CAPITAL;
    peak = Math.max(peak, point.value);

    // Same formulas as verifyPerformanceMetrics → on-page verification passes.
    const cumulativeReturn = point.value - 100; // curve is indexed to 100
    const dailyReturn =
      i === 0 ? 0 : (point.value / points[i - 1]!.value - 1) * 100;
    const drawdown = (point.value / peak - 1) * 100; // <= 0
    const dcaCumulative = point.dca - 100;

    const isRebalance = i > 0 && i % REBALANCE_EVERY === 0;
    const gasUsd = isRebalance ? '8.20' : '0.00';
    const slippageUsd = isRebalance ? '3.10' : '0.00';
    const totalUsd = isRebalance ? '11.30' : '0.00';

    const snapshot: DailySnapshot = {
      schemaVersion: SCHEMA_VERSION,
      strategyId: STRATEGY_ID,
      strategyVersion: STRATEGY_VERSION,
      date: point.date,
      timestamp: `${point.date}T00:00:00.000Z`,
      chainIds: [MAINNET],
      walletAddresses: [MODEL_WALLET],
      previousCid: i === 0 ? null : cidFor(i - 1),
      nav: { usd: navUsd.toFixed(2) },
      performance: {
        dailyReturn: signed(dailyReturn),
        cumulativeReturn: signed(cumulativeReturn),
        maxDrawdown: `${drawdown.toFixed(2)}%`,
      },
      positions: positionsForNav(navUsd),
      costs: {
        gasUsd,
        slippageUsd,
        protocolFeesUsd: '0.00',
        totalUsd,
      },
      transactions: isRebalance
        ? [
            {
              chainId: MAINNET,
              hash: pseudoHash(point.date),
              type: 'rebalance',
            },
          ]
        : [],
      benchmarks: [
        { name: 'DCA Classic', cumulativeReturn: signed(dcaCumulative) },
      ],
    };

    return { cid: cidFor(i), snapshot };
  });
}

export const mockSnapshotEntries: SnapshotHistoryEntry[] = buildEntries();

const mockLatestSnapshot: DailySnapshot | null =
  mockSnapshotEntries[mockSnapshotEntries.length - 1]?.snapshot ?? null;

/** Sentinel CID — consumers compare meta.latestSnapshotCid against this to detect demo mode. */
export const MOCK_LATEST_CID: string =
  mockSnapshotEntries[mockSnapshotEntries.length - 1]?.cid ?? '';

export const mockMeta = {
  schemaVersion: SCHEMA_VERSION,
  strategyId: STRATEGY_ID,
  strategyVersion: STRATEGY_VERSION,
  latestSnapshotCid: MOCK_LATEST_CID,
  updatedAt: mockLatestSnapshot
    ? `${mockLatestSnapshot.date}T00:00:00.000Z`
    : '',
} as const;

/** Enabled by default; opt out with NEXT_PUBLIC_TRACK_RECORD_MOCK=0. */
export function isTrackRecordMockEnabled(): boolean {
  return process.env['NEXT_PUBLIC_TRACK_RECORD_MOCK'] !== '0';
}
