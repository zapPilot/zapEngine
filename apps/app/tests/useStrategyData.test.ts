import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useStrategyData } from '@/integration/useStrategyData';

const mocks = vi.hoisted(() => ({
  backtest: vi.fn(),
  regime: vi.fn(),
  suggestion: vi.fn(),
}));

vi.mock(
  '@zapengine/app-core/hooks/queries/market/useRegimeHistoryQuery',
  () => ({ useRegimeHistory: mocks.regime }),
);
vi.mock('@/integration/useDefaultStrategyBacktest', () => ({
  useDefaultStrategyBacktest: mocks.backtest,
}));
vi.mock('@/integration/useStrategySuggestion', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/integration/useStrategySuggestion')
    >();
  return { ...actual, useStrategySuggestion: mocks.suggestion };
});

function settled(data?: unknown) {
  return { data, isLoading: false, isError: false };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.regime.mockReturnValue(settled());
  mocks.suggestion.mockReturnValue(settled());
  mocks.backtest.mockReturnValue(settled());
});

describe('useStrategyData', () => {
  it('renders explicit unavailable values when no live data is available', () => {
    const result = useStrategyData('user-1', 90);

    expect(mocks.suggestion).toHaveBeenCalledWith('user-1');
    expect(mocks.backtest).toHaveBeenCalledWith(90);
    expect(result).toMatchObject({ isLoading: false, isError: false });
    expect(result.data).toEqual({
      hasTargetAllocation: false,
      backtest: {
        returnLabel: '—',
        vsBtcLabel: 'Trades —',
        vsEthLabel: 'Max DD —',
        metrics: expect.any(Array),
        currentModeLabel: '—',
        allocation: expect.any(Array),
        chartData: [],
        displayName: null,
      },
    });
    expect(result.data.backtest.allocation.map((row) => row.pct)).toEqual([
      0, 0, 0,
    ]);
    expect(result.data.backtest.metrics).toHaveLength(8);
    expect(result.data.backtest.metrics.every((row) => row.value === '—')).toBe(
      true,
    );
  });

  it('stays on dashes rather than demo values before the user id resolves', () => {
    const result = useStrategyData(null);

    expect(mocks.suggestion).toHaveBeenCalledWith(null);
    expect(mocks.backtest).toHaveBeenCalledWith(undefined);
    expect(result.isLoading).toBe(false);
    expect(result.data.hasTargetAllocation).toBe(false);
    expect(result.data.backtest.returnLabel).toBe('—');
    expect(result.data.backtest.chartData).toEqual([]);
  });

  it('combines live market, target, and backtest values', () => {
    const metrics = [{ label: 'ROI', value: '+9%', tone: 'positive' }];
    mocks.regime.mockReturnValue(settled({ currentRegime: 'g' }));
    mocks.suggestion.mockReturnValue(
      settled({
        context: {
          target: {
            allocation: {
              spy: 0.404,
              btc: 0.2,
              eth: 0.15,
              alt: 0.05,
              stable: 0.196,
            },
          },
        },
      }),
    );
    mocks.backtest.mockReturnValue(
      settled({
        returnLabel: '+9%',
        vsBtcLabel: '12 trades',
        vsEthLabel: 'Max DD 4%',
        metrics,
        chartData: [100, 109],
        displayName: 'DMA/FGI Portfolio Rules',
      }),
    );

    const result = useStrategyData('user-1');

    expect(result.data).toMatchObject({
      hasTargetAllocation: true,
      backtest: {
        returnLabel: '+9%',
        vsBtcLabel: '12 trades',
        vsEthLabel: 'Max DD 4%',
        metrics,
        currentModeLabel: 'Greed',
        chartData: [100, 109],
        displayName: 'DMA/FGI Portfolio Rules',
      },
    });
    expect(result.data.backtest.allocation.map((row) => row.pct)).toEqual([
      40, 40, 20,
    ]);
  });

  it('aggregates loading and only the surfaced error sources', () => {
    mocks.regime.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: true,
    });
    mocks.suggestion.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: true,
    });
    mocks.backtest.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    expect(useStrategyData('user-1')).toMatchObject({
      isLoading: true,
      isError: false,
    });

    mocks.backtest.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    expect(useStrategyData('user-1').isError).toBe(true);
  });
});
