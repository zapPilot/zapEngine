import { UNIFIED_COLORS } from '@/constants/assets';
import type {
  BacktestSpotAssetSymbol,
  BacktestStrategyPoint,
} from '@/types/backtesting';

const BACKTEST_SPOT_ASSET_COLORS: Record<BacktestSpotAssetSymbol, string> = {
  BTC: UNIFIED_COLORS.BTC,
  ETH: UNIFIED_COLORS.ETH,
  SPY: UNIFIED_COLORS.SPY,
} as const;

/**
 * Returns the shared chart color used for a normalized backtesting spot asset.
 *
 * @param asset - Normalized spot asset symbol from backtesting decisions.
 * @returns The portfolio chart color aligned to the requested asset.
 * @example
 * ```ts
 * getBacktestSpotAssetColor("BTC");
 * ```
 */
export function getBacktestSpotAssetColor(
  asset: BacktestSpotAssetSymbol,
): string {
  return BACKTEST_SPOT_ASSET_COLORS[asset];
}

/**
 * Normalizes arbitrary spot asset values from backtesting payloads.
 *
 * @param value - Unknown backend value for a spot asset.
 * @returns A normalized spot asset symbol or `null` when unsupported.
 * @example
 * ```ts
 * normalizeBacktestSpotAsset(" eth ");
 * ```
 */
function normalizeBacktestSpotAsset(
  value: unknown,
): BacktestSpotAssetSymbol | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === 'BTC' || normalized === 'ETH' || normalized === 'SPY') {
    return normalized;
  }

  return null;
}

type SpotAssetStrategyLike = Pick<
  BacktestStrategyPoint,
  'portfolio' | 'decision'
>;

function getAllocationValue(
  allocation: unknown,
  key: 'btc' | 'eth' | 'spy' | 'spot',
): number {
  if (!allocation || typeof allocation !== 'object') {
    return 0;
  }

  const value = (allocation as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : 0;
}

/**
 * Resolves the current spot asset for a backtesting strategy point.
 *
 * Uses `portfolio.spot_asset` as the explicit source and falls back to the
 * dominant canonical allocation bucket. Stable-only points return `null`
 * because they do not currently hold a spot asset.
 *
 * @param strategy - Strategy point to inspect.
 * @returns The current spot asset symbol or `null` when no spot exposure exists.
 * @example
 * ```ts
 * resolveBacktestSpotAsset(strategyPoint);
 * ```
 */
export function resolveBacktestSpotAsset(
  strategy: SpotAssetStrategyLike | null | undefined,
): BacktestSpotAssetSymbol | null {
  if (!strategy) {
    return null;
  }

  const allocation =
    strategy.portfolio.asset_allocation ?? strategy.portfolio.allocation;
  const tradeableShares: [BacktestSpotAssetSymbol, number][] = [
    [
      'BTC',
      getAllocationValue(allocation, 'btc') ||
        getAllocationValue(allocation, 'spot'),
    ],
    ['ETH', getAllocationValue(allocation, 'eth')],
    ['SPY', getAllocationValue(allocation, 'spy')],
  ];
  const tradeableTotal = tradeableShares.reduce(
    (total, [, value]) => total + value,
    0,
  );
  if (tradeableTotal <= 0) {
    return null;
  }

  const canonical = normalizeBacktestSpotAsset(strategy.portfolio.spot_asset);
  if (canonical) {
    return canonical;
  }

  const dominantAsset = tradeableShares.reduce(
    (best, entry) => (entry[1] > best[1] ? entry : best),
    ['BTC', 0] as [BacktestSpotAssetSymbol, number],
  );
  return dominantAsset[1] > 0 ? dominantAsset[0] : null;
}
