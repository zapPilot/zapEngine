// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MarketDashboardResponse } from '@zapengine/app-core/services/analyticsService';

import { MARKET_SIGNALS_DAYS } from '../src/integration/marketSignalsModel';
import { useMarketSignals } from '../src/integration/useMarketSignals';

type UseMarketSignalsResult = ReturnType<typeof useMarketSignals>;

const useMarketDashboardQueryMock = vi.hoisted(() => vi.fn());
vi.mock(
  '@zapengine/app-core/hooks/queries/market/useMarketDashboardQuery',
  () => ({
    useMarketDashboardQuery: useMarketDashboardQueryMock,
  }),
);

function dashboardWithBtc(): MarketDashboardResponse {
  return {
    series: {},
    meta: {
      primary_series: 'btc',
      days_requested: 2,
      count: 2,
      timestamp: '2026-09-24T00:00:00Z',
    },
    snapshots: [
      {
        snapshot_date: '2026-09-23',
        values: {
          btc: {
            value: 100,
            indicators: { dma_200: { value: 100, is_above: false } },
            tags: {},
          },
        },
      },
      {
        snapshot_date: '2026-09-24',
        values: {
          btc: {
            value: 120,
            indicators: { dma_200: { value: 100, is_above: true } },
            tags: {},
          },
        },
      },
    ],
  } as unknown as MarketDashboardResponse;
}

function renderMarketSignals(): UseMarketSignalsResult {
  const container = document.createElement('div');
  const root = createRoot(container);
  const results: UseMarketSignalsResult[] = [];
  function Probe() {
    results.push(useMarketSignals());
    return null;
  }

  act(() => {
    root.render(createElement(Probe));
  });
  act(() => {
    root.unmount();
  });

  const result = results.at(-1);
  if (!result) throw new Error('useMarketSignals never rendered');
  return result;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  useMarketDashboardQueryMock.mockReset();
  useMarketDashboardQueryMock.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
  });
});

describe('useMarketSignals', () => {
  it('requests the full-year market dashboard window for StrategyScreen', () => {
    expect(MARKET_SIGNALS_DAYS).toBe(365);

    renderMarketSignals();

    expect(useMarketDashboardQueryMock).toHaveBeenCalledWith(
      MARKET_SIGNALS_DAYS,
    );
  });

  it('maps dashboard snapshots to market signals for the card', () => {
    useMarketDashboardQueryMock.mockReturnValue({
      data: dashboardWithBtc(),
      isLoading: false,
      isError: false,
    });

    const result = renderMarketSignals();

    expect(result).toMatchObject({ isLoading: false, isError: false });
    expect(result.data?.asOf).toBe('2026-09-24');
    expect(result.data?.trends).toHaveLength(1);
    expect(result.data?.trends[0]).toMatchObject({
      id: 'btc',
      latest: 120,
      dma: 100,
      isAbove: true,
    });
  });

  it('returns null signals while the dashboard is still resolving', () => {
    useMarketDashboardQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const result = renderMarketSignals();

    expect(result).toEqual({
      data: null,
      isLoading: true,
      isError: false,
    });
  });

  it('propagates upstream dashboard errors instead of stale signals', () => {
    useMarketDashboardQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    const result = renderMarketSignals();

    expect(result).toEqual({
      data: null,
      isLoading: false,
      isError: true,
    });
  });
});
