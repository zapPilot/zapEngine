import { renderHook } from '@testing-library/react';
import { usePortfolioDataProgressive } from '@zapengine/app-core/hooks/queries/analytics/usePortfolioDataProgressive';
import * as Transformers from '@zapengine/app-core/lib/portfolio/portfolioTransformers';
import { logger } from '@zapengine/app-core/utils/logger';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseLandingPageData = vi.fn();
const mockUseSentimentData = vi.fn();
const mockUseRegimeHistory = vi.fn();
const mockTransformToWallet = vi.fn();

vi.mock(
  '@zapengine/app-core/hooks/queries/analytics/usePortfolioQuery',
  () => ({
    useLandingPageData: (...args: unknown[]) => mockUseLandingPageData(...args),
  }),
);

vi.mock('@zapengine/app-core/hooks/queries/market/useSentimentQuery', () => ({
  useSentimentData: (...args: unknown[]) => mockUseSentimentData(...args),
}));

vi.mock(
  '@zapengine/app-core/hooks/queries/market/useRegimeHistoryQuery',
  () => ({
    useRegimeHistory: (...args: unknown[]) => mockUseRegimeHistory(...args),
  }),
);

vi.mock('@zapengine/app-core/adapters/walletPortfolioDataAdapter', () => ({
  transformToWalletPortfolioDataWithDirection: (...args: unknown[]) =>
    mockTransformToWallet(...args),
}));

vi.mock('@zapengine/app-core/lib/portfolio/portfolioTransformers', () => ({
  extractBalanceData: vi.fn(() => null),
  extractCompositionData: vi.fn(() => null),
  combineStrategyData: vi.fn(() => null),
  extractSentimentData: vi.fn(() => null),
}));

vi.mock('@zapengine/app-core/utils/logger', () => ({
  logger: { debug: vi.fn() },
}));

describe('usePortfolioDataProgressive', () => {
  const defaultQueryResult = {
    data: null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLandingPageData.mockReturnValue(defaultQueryResult);
    mockUseSentimentData.mockReturnValue(defaultQueryResult);
    mockUseRegimeHistory.mockReturnValue(defaultQueryResult);
    mockTransformToWallet.mockReturnValue({ balance: 0 });
  });

  it('returns null unifiedData when landing data is null', () => {
    const { result } = renderHook(() => usePortfolioDataProgressive('user1'));
    expect(result.current.unifiedData).toBeNull();
  });

  it('builds unifiedData when landing data exists', () => {
    const landingData = { portfolios: [] };
    mockUseLandingPageData.mockReturnValue({
      ...defaultQueryResult,
      data: landingData,
    });
    const { result } = renderHook(() => usePortfolioDataProgressive('user1'));
    expect(mockTransformToWallet).toHaveBeenCalledWith(landingData, null, null);
    expect(result.current.unifiedData).toEqual({ balance: 0 });
  });

  it('passes sentiment and regime data to transform when available', () => {
    const landingData = { portfolios: [] };
    const sentimentData = { value: 65 };
    const regimeData = { regime: 'g' };
    mockUseLandingPageData.mockReturnValue({
      ...defaultQueryResult,
      data: landingData,
    });
    mockUseSentimentData.mockReturnValue({
      ...defaultQueryResult,
      data: sentimentData,
    });
    mockUseRegimeHistory.mockReturnValue({
      ...defaultQueryResult,
      data: regimeData,
    });
    const { result } = renderHook(() => usePortfolioDataProgressive('user1'));
    expect(mockTransformToWallet).toHaveBeenCalledWith(
      landingData,
      sentimentData,
      regimeData,
    );
    expect(result.current.unifiedData).toBeDefined();
  });

  it('returns true for isLoading when landing is loading', () => {
    mockUseLandingPageData.mockReturnValue({
      ...defaultQueryResult,
      isLoading: true,
    });
    const { result } = renderHook(() => usePortfolioDataProgressive('user1'));
    expect(result.current.isLoading).toBe(true);
  });

  it('returns true for isLoading when sentiment is loading', () => {
    mockUseSentimentData.mockReturnValue({
      ...defaultQueryResult,
      isLoading: true,
    });
    const { result } = renderHook(() => usePortfolioDataProgressive('user1'));
    expect(result.current.isLoading).toBe(true);
  });

  it('returns true for isLoading when regime is loading', () => {
    mockUseRegimeHistory.mockReturnValue({
      ...defaultQueryResult,
      isLoading: true,
    });
    const { result } = renderHook(() => usePortfolioDataProgressive('user1'));
    expect(result.current.isLoading).toBe(true);
  });

  it('returns false for isLoading when nothing is loading', () => {
    const { result } = renderHook(() => usePortfolioDataProgressive('user1'));
    expect(result.current.isLoading).toBe(false);
  });

  it('returns landing error as priority', () => {
    const landingError = new Error('Landing failed');
    mockUseLandingPageData.mockReturnValue({
      ...defaultQueryResult,
      error: landingError,
    });
    const { result } = renderHook(() => usePortfolioDataProgressive('user1'));
    expect(result.current.error).toBe(landingError);
  });

  it('returns sentiment error when no landing error', () => {
    const sentimentError = new Error('Sentiment failed');
    mockUseSentimentData.mockReturnValue({
      ...defaultQueryResult,
      error: sentimentError,
    });
    const { result } = renderHook(() => usePortfolioDataProgressive('user1'));
    expect(result.current.error).toBe(sentimentError);
  });

  it('returns regime error when no other errors', () => {
    const regimeError = new Error('Regime failed');
    mockUseRegimeHistory.mockReturnValue({
      ...defaultQueryResult,
      error: regimeError,
    });
    const { result } = renderHook(() => usePortfolioDataProgressive('user1'));
    expect(result.current.error).toBe(regimeError);
  });

  it('returns null error when no errors', () => {
    const { result } = renderHook(() => usePortfolioDataProgressive('user1'));
    expect(result.current.error).toBeNull();
  });

  it('calls refetchAll which triggers all query refetches', async () => {
    const mockRefetchLanding = vi.fn().mockResolvedValue(undefined);
    const mockRefetchSentiment = vi.fn().mockResolvedValue(undefined);
    const mockRefetchRegime = vi.fn().mockResolvedValue(undefined);
    mockUseLandingPageData.mockReturnValue({
      ...defaultQueryResult,
      refetch: mockRefetchLanding,
    });
    mockUseSentimentData.mockReturnValue({
      ...defaultQueryResult,
      refetch: mockRefetchSentiment,
    });
    mockUseRegimeHistory.mockReturnValue({
      ...defaultQueryResult,
      refetch: mockRefetchRegime,
    });

    const { result } = renderHook(() => usePortfolioDataProgressive('user1'));
    await result.current.refetch();

    expect(mockRefetchLanding).toHaveBeenCalled();
    expect(mockRefetchSentiment).toHaveBeenCalled();
    expect(mockRefetchRegime).toHaveBeenCalled();
  });

  it('passes isEtlInProgress to useLandingPageData', () => {
    renderHook(() => usePortfolioDataProgressive('user1', true));
    expect(mockUseLandingPageData).toHaveBeenCalledWith('user1', true, true);
  });

  it('forwards isLandingActive=false to useLandingPageData when consumer view is inactive', () => {
    renderHook(() => usePortfolioDataProgressive('user1', false, false));
    expect(mockUseLandingPageData).toHaveBeenCalledWith('user1', false, false);
  });

  it('disables landing data while desktop/root waits for a user id', () => {
    renderHook(() => usePortfolioDataProgressive(''));
    expect(mockUseLandingPageData).toHaveBeenCalledWith('', false, false);
  });

  it('does not surface stale empty-user landing errors as global errors', () => {
    const emptyUserError = new Error('User ID is required');
    mockUseLandingPageData.mockReturnValue({
      ...defaultQueryResult,
      error: emptyUserError,
    });

    const { result } = renderHook(() => usePortfolioDataProgressive(''));

    expect(result.current.error).toBeNull();
  });

  it('does not manually refetch landing data without a user id', async () => {
    const mockRefetchLanding = vi.fn().mockResolvedValue(undefined);
    const mockRefetchSentiment = vi.fn().mockResolvedValue(undefined);
    const mockRefetchRegime = vi.fn().mockResolvedValue(undefined);
    mockUseLandingPageData.mockReturnValue({
      ...defaultQueryResult,
      refetch: mockRefetchLanding,
    });
    mockUseSentimentData.mockReturnValue({
      ...defaultQueryResult,
      refetch: mockRefetchSentiment,
    });
    mockUseRegimeHistory.mockReturnValue({
      ...defaultQueryResult,
      refetch: mockRefetchRegime,
    });

    const { result } = renderHook(() => usePortfolioDataProgressive(''));
    await result.current.refetch();

    expect(mockRefetchLanding).not.toHaveBeenCalled();
    expect(mockRefetchSentiment).toHaveBeenCalled();
    expect(mockRefetchRegime).toHaveBeenCalled();
  });

  it('forwards isStrategyActive=false to market queries when strategy view is inactive', () => {
    renderHook(() => usePortfolioDataProgressive('user1', false, true, false));

    expect(mockUseSentimentData).toHaveBeenCalledWith(false);
    expect(mockUseRegimeHistory).toHaveBeenCalledWith(false);
  });

  it('skips market refetches when strategy view is inactive', async () => {
    const mockRefetchLanding = vi.fn().mockResolvedValue(undefined);
    const mockRefetchSentiment = vi.fn().mockResolvedValue(undefined);
    const mockRefetchRegime = vi.fn().mockResolvedValue(undefined);
    mockUseLandingPageData.mockReturnValue({
      ...defaultQueryResult,
      refetch: mockRefetchLanding,
    });
    mockUseSentimentData.mockReturnValue({
      ...defaultQueryResult,
      refetch: mockRefetchSentiment,
    });
    mockUseRegimeHistory.mockReturnValue({
      ...defaultQueryResult,
      refetch: mockRefetchRegime,
    });

    const { result } = renderHook(() =>
      usePortfolioDataProgressive('user1', false, true, false),
    );
    await result.current.refetch();

    expect(mockRefetchLanding).toHaveBeenCalled();
    expect(mockRefetchSentiment).not.toHaveBeenCalled();
    expect(mockRefetchRegime).not.toHaveBeenCalled();
  });

  it('logs query states including error messages', () => {
    const landingError = new Error('Landing error msg');
    mockUseLandingPageData.mockReturnValue({
      ...defaultQueryResult,
      error: landingError,
    });
    renderHook(() => usePortfolioDataProgressive('user1'));
    expect(logger.debug).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Section-level data extraction (merged from .tsx duplicate)
  // -------------------------------------------------------------------------
  describe('section data extraction', () => {
    it('returns sections with data when queries succeed', () => {
      const landingData = { portfolios: [] };
      vi.mocked(Transformers.extractBalanceData).mockReturnValue(
        'balanceData' as never,
      );
      vi.mocked(Transformers.extractCompositionData).mockReturnValue(
        'compositionData' as never,
      );
      vi.mocked(Transformers.combineStrategyData).mockReturnValue(
        'strategyData' as never,
      );
      vi.mocked(Transformers.extractSentimentData).mockReturnValue(
        'sentimentData' as never,
      );
      const sentimentData = { value: 65 };
      const regimeData = { regime: 'g' };
      mockUseLandingPageData.mockReturnValue({
        ...defaultQueryResult,
        data: landingData,
      });
      mockUseSentimentData.mockReturnValue({
        ...defaultQueryResult,
        data: sentimentData,
      });
      mockUseRegimeHistory.mockReturnValue({
        ...defaultQueryResult,
        data: regimeData,
      });

      const { result } = renderHook(() => usePortfolioDataProgressive('user1'));

      expect(result.current.sections.balance.data).toBe('balanceData');
      expect(result.current.sections.composition.data).toBe('compositionData');
      expect(result.current.sections.strategy.data).toBe('strategyData');
      expect(result.current.sections.sentiment.data).toBe('sentimentData');
    });

    it('propagates landing loading state to dependent sections', () => {
      mockUseLandingPageData.mockReturnValue({
        ...defaultQueryResult,
        isLoading: true,
      });

      const { result } = renderHook(() => usePortfolioDataProgressive('user1'));

      expect(result.current.sections.balance.isLoading).toBe(true);
      expect(result.current.sections.composition.isLoading).toBe(true);
      expect(result.current.sections.strategy.isLoading).toBe(true);
      // Sentiment is independent of landing
      expect(result.current.sections.sentiment.isLoading).toBe(false);
    });

    it('propagates sentiment loading to strategy section', () => {
      mockUseSentimentData.mockReturnValue({
        ...defaultQueryResult,
        isLoading: true,
      });

      const { result } = renderHook(() => usePortfolioDataProgressive('user1'));

      expect(result.current.sections.balance.isLoading).toBe(false);
      expect(result.current.sections.strategy.isLoading).toBe(true);
      expect(result.current.sections.sentiment.isLoading).toBe(true);
    });

    it('propagates landing error to dependent sections', () => {
      const error = new Error('Landing failed');
      mockUseLandingPageData.mockReturnValue({
        ...defaultQueryResult,
        data: null,
        error,
      });

      const { result } = renderHook(() => usePortfolioDataProgressive('user1'));

      expect(result.current.sections.balance.error).toBe(error);
      expect(result.current.sections.balance.data).toBeNull();
    });
  });
});
