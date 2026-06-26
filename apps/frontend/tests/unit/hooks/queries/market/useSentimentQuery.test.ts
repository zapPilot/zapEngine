import { useQuery } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { useSentimentData } from '@zapengine/app-core/hooks/queries/market/useSentimentQuery';
import { fetchMarketSentiment } from '@zapengine/app-core/services';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: vi.fn(),
  };
});

vi.mock('@zapengine/app-core/services', () => ({
  fetchMarketSentiment: vi.fn(),
}));

describe('useSentimentData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useQuery>);
  });

  it('configures sentiment query caching without polling', () => {
    renderHook(() => useSentimentData());

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['sentiment', 'market'],
        staleTime: 10 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        enabled: true,
        retry: 1,
      }),
    );
  });

  it('passes disabled state to the query when requested', () => {
    renderHook(() => useSentimentData(false));

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
      }),
    );
  });

  it('uses fetchMarketSentiment as the logged query function', async () => {
    const sentiment = {
      value: 55,
      status: 'Neutral',
      timestamp: '2026-01-01T00:00:00Z',
      quote: {
        quote: 'Stay balanced.',
        author: 'Test Author',
        sentiment: 'Neutral',
      },
    };
    vi.mocked(fetchMarketSentiment).mockResolvedValue(sentiment);

    renderHook(() => useSentimentData());

    const queryOptions = vi.mocked(useQuery).mock.calls[0][0] as {
      queryFn: () => Promise<unknown>;
    };
    await expect(queryOptions.queryFn()).resolves.toEqual(sentiment);
    expect(fetchMarketSentiment).toHaveBeenCalledOnce();
  });
});
