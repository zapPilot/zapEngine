// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { usePortfolioDataProgressive } from '@core/hooks/queries/analytics/usePortfolioDataProgressive';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  landing: {
    data: undefined as unknown,
    isLoading: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  sentiment: {
    data: undefined as unknown,
    isLoading: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  regime: {
    data: undefined as unknown,
    isLoading: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  useLandingPageData: vi.fn(),
  useSentimentData: vi.fn(),
  useRegimeHistory: vi.fn(),
  transformUnified: vi.fn(),
  extractBalanceData: vi.fn(),
  extractCompositionData: vi.fn(),
  combineStrategyData: vi.fn(),
  extractSentimentData: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('@core/hooks/queries/analytics/usePortfolioQuery', () => ({
  useLandingPageData: (...args: unknown[]) => {
    mocks.useLandingPageData(...args);
    return mocks.landing;
  },
}));

vi.mock('@core/hooks/queries/market/useSentimentQuery', () => ({
  useSentimentData: (...args: unknown[]) => {
    mocks.useSentimentData(...args);
    return mocks.sentiment;
  },
}));

vi.mock('@core/hooks/queries/market/useRegimeHistoryQuery', () => ({
  useRegimeHistory: (...args: unknown[]) => {
    mocks.useRegimeHistory(...args);
    return mocks.regime;
  },
}));

vi.mock('@core/adapters/walletPortfolioDataAdapter', () => ({
  transformToWalletPortfolioDataWithDirection: (...args: unknown[]) =>
    mocks.transformUnified(...args),
}));

vi.mock('@core/lib/portfolio/portfolioTransformers', () => ({
  extractBalanceData: (...args: unknown[]) => mocks.extractBalanceData(...args),
  extractCompositionData: (...args: unknown[]) =>
    mocks.extractCompositionData(...args),
  combineStrategyData: (...args: unknown[]) =>
    mocks.combineStrategyData(...args),
  extractSentimentData: (...args: unknown[]) =>
    mocks.extractSentimentData(...args),
}));

vi.mock('@core/utils', () => ({
  logger: { debug: mocks.debug },
}));

function resetQuery(query: typeof mocks.landing) {
  query.data = undefined;
  query.isLoading = false;
  query.error = null;
  query.refetch.mockReset();
  query.refetch.mockResolvedValue(undefined);
}

describe('usePortfolioDataProgressive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetQuery(mocks.landing);
    resetQuery(mocks.sentiment);
    resetQuery(mocks.regime);
    mocks.transformUnified.mockReturnValue({ unified: true });
    mocks.extractBalanceData.mockReturnValue({ balance: true });
    mocks.extractCompositionData.mockReturnValue({ composition: true });
    mocks.combineStrategyData.mockReturnValue({ strategy: true });
    mocks.extractSentimentData.mockReturnValue({ sentiment: true });
  });

  it('trims user ids, gates queries, and returns empty unified data without landing data', () => {
    const { result } = renderHook(() =>
      usePortfolioDataProgressive('  user-1  ', false, true, true),
    );

    expect(mocks.useLandingPageData).toHaveBeenCalledWith(
      'user-1',
      false,
      true,
    );
    expect(mocks.useSentimentData).toHaveBeenCalledWith(true);
    expect(mocks.useRegimeHistory).toHaveBeenCalledWith(true);
    expect(result.current.unifiedData).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mocks.transformUnified).not.toHaveBeenCalled();
    expect(mocks.debug).toHaveBeenCalledWith(
      '[usePortfolioDataProgressive] Query States:',
      expect.objectContaining({ userId: 'user-1', isEtlInProgress: false }),
    );
  });

  it('disables landing for blank ids or inactive landing views', () => {
    renderHook(() => usePortfolioDataProgressive('   ', true, true, false));
    expect(mocks.useLandingPageData).toHaveBeenLastCalledWith('', true, false);
    expect(mocks.useSentimentData).toHaveBeenLastCalledWith(false);
    expect(mocks.useRegimeHistory).toHaveBeenLastCalledWith(false);

    renderHook(() => usePortfolioDataProgressive('user-1', false, false, true));
    expect(mocks.useLandingPageData).toHaveBeenLastCalledWith(
      'user-1',
      false,
      false,
    );
  });

  it('builds unified data with optional sentiment/regime fallbacks and exposes section data', () => {
    mocks.landing.data = { landing: true };
    const { result, rerender } = renderHook(() =>
      usePortfolioDataProgressive('user-1'),
    );

    expect(mocks.transformUnified).toHaveBeenCalledWith(
      mocks.landing.data,
      null,
      null,
    );
    expect(result.current.unifiedData).toEqual({ unified: true });
    expect(result.current.sections.balance.data).toEqual({ balance: true });
    expect(result.current.sections.composition.data).toEqual({
      composition: true,
    });
    expect(result.current.sections.strategy.data).toBeNull();
    expect(result.current.sections.sentiment.data).toBeNull();

    mocks.sentiment.data = { sentiment: 'data' };
    mocks.regime.data = { regime: 'data' };
    rerender();
    expect(mocks.transformUnified).toHaveBeenLastCalledWith(
      mocks.landing.data,
      mocks.sentiment.data,
      mocks.regime.data,
    );
    expect(result.current.sections.strategy.data).toEqual({ strategy: true });
    expect(result.current.sections.sentiment.data).toEqual({ sentiment: true });
  });

  it('combines loading state across all three queries', () => {
    mocks.landing.isLoading = true;
    const first = renderHook(() => usePortfolioDataProgressive('user-1'));
    expect(first.result.current.isLoading).toBe(true);
    first.unmount();

    mocks.landing.isLoading = false;
    mocks.sentiment.isLoading = true;
    const second = renderHook(() => usePortfolioDataProgressive('user-1'));
    expect(second.result.current.isLoading).toBe(true);
    second.unmount();

    mocks.sentiment.isLoading = false;
    mocks.regime.isLoading = true;
    const third = renderHook(() => usePortfolioDataProgressive('user-1'));
    expect(third.result.current.isLoading).toBe(true);
  });

  it('prioritizes eligible landing errors, then sentiment and regime errors', () => {
    const landingError = new Error('landing');
    const sentimentError = new Error('sentiment');
    const regimeError = new Error('regime');
    mocks.landing.error = landingError;
    mocks.sentiment.error = sentimentError;
    mocks.regime.error = regimeError;

    const withUser = renderHook(() => usePortfolioDataProgressive('user-1'));
    expect(withUser.result.current.error).toBe(landingError);
    withUser.unmount();

    const blankUser = renderHook(() => usePortfolioDataProgressive(undefined));
    expect(blankUser.result.current.error).toBe(sentimentError);
    blankUser.unmount();

    mocks.sentiment.error = null;
    const regimeOnly = renderHook(() => usePortfolioDataProgressive(undefined));
    expect(regimeOnly.result.current.error).toBe(regimeError);
  });

  it('refetches only data sources enabled by user and strategy state', async () => {
    const enabled = renderHook(() =>
      usePortfolioDataProgressive('user-1', false, true, true),
    );
    await act(async () => {
      await enabled.result.current.refetch();
    });
    expect(mocks.landing.refetch).toHaveBeenCalledTimes(1);
    expect(mocks.sentiment.refetch).toHaveBeenCalledTimes(1);
    expect(mocks.regime.refetch).toHaveBeenCalledTimes(1);
    enabled.unmount();

    vi.clearAllMocks();
    const disabled = renderHook(() =>
      usePortfolioDataProgressive(undefined, false, true, false),
    );
    await act(async () => {
      await disabled.result.current.refetch();
    });
    expect(mocks.landing.refetch).not.toHaveBeenCalled();
    expect(mocks.sentiment.refetch).not.toHaveBeenCalled();
    expect(mocks.regime.refetch).not.toHaveBeenCalled();
  });
});
