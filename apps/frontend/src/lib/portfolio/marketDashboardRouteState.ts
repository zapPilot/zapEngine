import {
  DEFAULT_ACTIVE_LINES,
  MARKET_LINE_KEYS,
  MARKET_VIEW_TIMEFRAMES,
  type MarketLineKey,
  type Timeframe,
} from '@/components/wallet/portfolio/views/invest/market/sections/marketDashboardConstants';
import { isMember } from '@/lib/portfolio/routeStateShared';

export interface MarketDashboardRouteState {
  timeframe: Timeframe;
  activeLines: ReadonlySet<MarketLineKey>;
}

export interface MarketDashboardRouteStatePatch {
  timeframe?: Timeframe;
  activeLines?: ReadonlySet<MarketLineKey>;
}

type SearchParamsLike = Pick<URLSearchParams, 'get' | 'has' | 'toString'>;

const DEFAULT_TIMEFRAME: Timeframe = 'MAX';
const MARKET_VIEW_TIMEFRAME_IDS = MARKET_VIEW_TIMEFRAMES.map((tf) => tf.id);

function parseTimeframe(value: string | null): Timeframe {
  return isMember(MARKET_VIEW_TIMEFRAME_IDS, value) ? value : DEFAULT_TIMEFRAME;
}

function parseActiveLines(
  searchParams: SearchParamsLike,
): ReadonlySet<MarketLineKey> {
  if (!searchParams.has('lines')) {
    return DEFAULT_ACTIVE_LINES;
  }

  const lineKeys = searchParams
    .get('lines')
    ?.split(',')
    .filter((lineKey): lineKey is MarketLineKey =>
      isMember(MARKET_LINE_KEYS, lineKey),
    );

  return new Set(lineKeys ?? []);
}

function areLineSetsEqual(
  a: ReadonlySet<MarketLineKey>,
  b: ReadonlySet<MarketLineKey>,
): boolean {
  if (a.size !== b.size) {
    return false;
  }

  const compareMarketLineKeys = (
    left: MarketLineKey,
    right: MarketLineKey,
  ): number => MARKET_LINE_KEYS.indexOf(left) - MARKET_LINE_KEYS.indexOf(right);
  const sortedA = [...a].sort(compareMarketLineKeys);
  const sortedB = [...b].sort(compareMarketLineKeys);

  return sortedA.every((lineKey, index) => lineKey === sortedB[index]);
}

export function readMarketDashboardRouteState(
  searchParams: SearchParamsLike,
): MarketDashboardRouteState {
  return {
    timeframe: parseTimeframe(searchParams.get('tf')),
    activeLines: parseActiveLines(searchParams),
  };
}

export function buildMarketDashboardSearchParams(
  searchParams: SearchParamsLike,
  patch: MarketDashboardRouteStatePatch,
): URLSearchParams {
  const nextSearchParams = new URLSearchParams(searchParams.toString());
  const currentRouteState = readMarketDashboardRouteState(nextSearchParams);

  const nextTimeframe = patch.timeframe ?? currentRouteState.timeframe;
  const nextActiveLines = patch.activeLines ?? currentRouteState.activeLines;

  if (nextTimeframe === DEFAULT_TIMEFRAME) {
    nextSearchParams.delete('tf');
  } else {
    nextSearchParams.set('tf', nextTimeframe);
  }

  if (areLineSetsEqual(nextActiveLines, DEFAULT_ACTIVE_LINES)) {
    nextSearchParams.delete('lines');
  } else {
    nextSearchParams.set('lines', [...nextActiveLines].join(','));
  }

  return nextSearchParams;
}
