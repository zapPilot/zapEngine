import { describe, expect, it, vi } from 'vitest';
import {
  calculateAllocation,
  calculateDelta,
} from '../../src/adapters/portfolio/allocationAdapter';
import {
  createEmptyPortfolioState,
  transformToWalletPortfolioDataWithDirection,
} from '../../src/adapters/walletPortfolioDataAdapter';
import {
  extractBalanceData,
  extractCompositionData,
  combineStrategyData,
  extractSentimentData,
  isValidLandingData,
} from '../../src/lib/portfolio/portfolioTransformers';
import { createSectionState } from '../../src/lib/portfolio/sectionHelpers';
import { extractROIChanges } from '../../src/lib/portfolio/portfolioUtils';
import {
  getRegimeConfig,
  getRegimeFromSentiment,
  getRegimeFromStatus,
  getRegimeLabel,
} from '../../src/lib/domain/regime';
import { getTargetAllocation } from '../../src/adapters/portfolio/regimeAdapter';
import type {
  LandingPageResponse,
  MarketSentimentData,
  RegimeHistoryData,
} from '../../src/services';

function landing(btc = 40, eth = 20, stable = 40): LandingPageResponse {
  return {
    total_value: btc + eth + stable,
    net_portfolio_value: 90,
    portfolio_allocation: {
      btc: { total_value: btc, percentage_of_portfolio: btc },
      eth: { total_value: eth, percentage_of_portfolio: eth },
      others: { total_value: 0, percentage_of_portfolio: 0 },
      stablecoins: { total_value: stable, percentage_of_portfolio: stable },
    },
  } as LandingPageResponse;
}
describe('portfolio composition', () => {
  it('keeps portfolio percentages distinct from within-bucket percentages', () => {
    const result = calculateAllocation(landing());
    expect(result.crypto).toBe(60);
    expect(result.stable).toBe(40);
    expect(result.constituents.crypto.map((c) => c.value)).toEqual([
      (40 / 60) * 100,
      (20 / 60) * 100,
    ]);
    expect(result.simplifiedCrypto.map((c) => c.value)).toEqual([40, 20]);
    expect(result.constituents.stable.map((c) => c.value)).toEqual([60, 40]);
    expect(calculateDelta(60, 40)).toBe(20);
    expect(calculateDelta(40, 60)).toBe(20);
  });
  it('handles empty, stable-only, and crypto-only portfolios without NaN', () => {
    expect(calculateAllocation(landing(0, 0, 0))).toMatchObject({
      crypto: 0,
      stable: 0,
      constituents: { crypto: [], stable: [] },
      simplifiedCrypto: [],
    });
    expect(calculateAllocation(landing(0, 0, 100))).toMatchObject({
      crypto: 0,
      stable: 100,
      constituents: { crypto: [] },
    });
    expect(calculateAllocation(landing(100, 0, 0))).toMatchObject({
      crypto: 100,
      stable: 0,
      constituents: { stable: [] },
    });
  });
  it('combines balance, allocation and market state without inventing loaded data', () => {
    const d = landing();
    expect(extractBalanceData(d)).toEqual({
      balance: 90,
      roi: 0,
      roiChange7d: 0,
      roiChange30d: 0,
      lastUpdated: null,
    });
    expect(extractCompositionData(d)).toMatchObject({
      positions: 0,
      protocols: 0,
      chains: 0,
      currentAllocation: { crypto: 60 },
    });
    expect(combineStrategyData(undefined, undefined, undefined)).toBeNull();
    expect(combineStrategyData(d, undefined, undefined)).toMatchObject({
      currentRegime: 'n',
      hasSentiment: false,
      hasRegimeHistory: false,
      sentimentValue: null,
    });
    const sentiment = {
      value: 10,
      status: 'Extreme Fear',
      quote: { quote: 'patient' },
    } as MarketSentimentData;
    const history = {
      currentRegime: 'ef',
      previousRegime: 'f',
      direction: 'fromRight',
      duration: null,
    } as RegimeHistoryData;
    expect(combineStrategyData(d, sentiment, history)).toMatchObject({
      currentRegime: 'ef',
      sentimentValue: 10,
      sentimentQuote: 'patient',
      hasSentiment: true,
      hasRegimeHistory: true,
    });
    expect(
      transformToWalletPortfolioDataWithDirection(d, sentiment, history),
    ).toMatchObject({
      balance: 90,
      previousRegime: 'f',
      currentRegime: 'ef',
      isLoading: false,
      hasError: false,
      riskMetrics: null,
      borrowingSummary: null,
    });
    expect(createEmptyPortfolioState(sentiment, null)).toMatchObject({
      sentimentValue: 10,
      currentRegime: 'ef',
      previousRegime: null,
      lastUpdated: null,
    });
    expect(extractSentimentData(sentiment)).toEqual({
      value: 10,
      status: 'Extreme Fear',
      quote: 'patient',
    });
    expect([null, undefined, 'x', {}, d].map(isValidLandingData)).toEqual([
      false,
      false,
      false,
      false,
      true,
    ]);
  });
  it('prefers window ROI values and preserves legacy response values', () => {
    const d = landing();
    d.portfolio_roi = {
      windows: { '7d': { value: 7 }, '30d': { value: 30 } },
      roi_7d: { value: 99 },
    } as LandingPageResponse['portfolio_roi'];
    expect(extractROIChanges(d)).toEqual({ change7d: 7, change30d: 30 });
    d.portfolio_roi = {
      roi_7d: { value: 2 },
      roi_30d: { value: 3 },
    } as LandingPageResponse['portfolio_roi'];
    expect(extractROIChanges(d)).toEqual({ change7d: 2, change30d: 3 });
    d.portfolio_roi = {} as LandingPageResponse['portfolio_roi'];
    expect(extractROIChanges(d)).toEqual({ change7d: 0, change30d: 0 });
  });
  it('waits for all required query data and propagates the first error', () => {
    const extract = vi.fn((a: number, b: number) => a + b);
    const failure = new Error('offline');
    expect(
      createSectionState(
        [
          { data: 1, isLoading: false, error: null },
          { data: undefined, isLoading: true, error: failure },
        ],
        extract,
      ),
    ).toEqual({ data: null, isLoading: true, error: failure });
    expect(extract).not.toHaveBeenCalled();
    expect(
      createSectionState(
        [
          { data: 0, isLoading: false, error: null },
          { data: 2, isLoading: false, error: null },
        ],
        extract,
      ).data,
    ).toBe(2);
    expect(extract).toHaveBeenCalledWith(0, 2);
  });
});
describe('regime boundaries', () => {
  it.each([
    [0, 'ef'],
    [25, 'ef'],
    [26, 'f'],
    [45, 'f'],
    [46, 'n'],
    [54, 'n'],
    [55, 'g'],
    [75, 'g'],
    [76, 'eg'],
    [100, 'eg'],
    [-1, 'n'],
    [101, 'n'],
    [NaN, 'n'],
    [Infinity, 'n'],
  ] as const)('maps sentiment %s to %s', (value, id) =>
    expect(getRegimeFromSentiment(value)).toBe(id),
  );
  it.each([
    [' Extreme Fear ', 'ef'],
    ['FEAR', 'f'],
    ['Neutral', 'n'],
    ['Greed', 'g'],
    ['Extreme Greed', 'eg'],
    ['bad', 'n'],
    [null, 'n'],
  ] as const)('normalizes status %s', (status, id) =>
    expect(getRegimeFromStatus(status)).toBe(id),
  );
  it('resolves API labels and internal IDs consistently with neutral fallback', () => {
    expect(getRegimeLabel('extreme_fear')).toBe('Extreme Fear');
    expect(getRegimeLabel('ef')).toBe('Extreme Fear');
    expect(getRegimeLabel(null)).toBe('');
    expect(getRegimeLabel('bad')).toBe('');
    expect(getRegimeConfig('extreme_greed')).toEqual(getRegimeConfig('eg'));
    expect(getRegimeConfig('bad')).toEqual(getRegimeConfig('n'));
    expect(getTargetAllocation('invalid' as never)).toEqual({
      crypto: 50,
      stable: 50,
    });
  });
});
