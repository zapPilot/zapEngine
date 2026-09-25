import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEMO } from '@/data/demo';
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
  it('uses the complete demo presentation while disconnected', () => {
    const result = useStrategyData(null, false);

    expect(result.isLoading).toBe(true);
    expect(result.isError).toBe(false);
    expect(result.data).toMatchObject({
      estApyLabel: DEMO.strategy.estApyLabel,
      marketModeLabel: DEMO.strategy.marketModeLabel,
      pillars: DEMO.strategy.pillars,
      hasTargetAllocation: false,
      backtest: {
        returnLabel: DEMO.strategy.backtest.returnLabel,
        metrics: DEMO.strategy.backtest.metrics,
        allocation: DEMO.strategy.backtest.allocation,
        chartData: [],
        displayName: null,
      },
    });
  });

  it('renders explicit unavailable values for a connected account with no data', () => {
    const result = useStrategyData('user-1', true, 90);

    expect(mocks.suggestion).toHaveBeenCalledWith('user-1');
    expect(mocks.backtest).toHaveBeenCalledWith(90);
    expect(result).toMatchObject({ isLoading: false, isError: false });
    expect(result.data).toMatchObject({
      estApyLabel: '—',
      marketModeLabel: 'Market mode · —',
      hasTargetAllocation: false,
      backtest: {
        returnLabel: '—',
        vsBtcLabel: 'Trades —',
        vsEthLabel: 'Max DD —',
        currentModeLabel: '—',
        chartData: [],
        displayName: null,
      },
    });
    expect(result.data?.pillars.map((row) => row.weight)).toEqual([0, 0, 0]);
    expect(result.data?.backtest.allocation.map((row) => row.pct)).toEqual([
      0, 0, 0,
    ]);
    expect(result.data?.backtest.metrics).toHaveLength(8);
    expect(
      result.data?.backtest.metrics.every((row) => row.value === '—'),
    ).toBe(true);
  });

  it('combines live market, target, and backtest values', () => {
    const metrics = [{ label: 'ROI', value: '+9%', tone: 'positive' }];
    mocks.regime.mockReturnValue(settled({ currentRegime: 'fear' }));
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
        displayName: 'Live strategy',
      }),
    );

    const result = useStrategyData('user-1', true);

    expect(result.data).toMatchObject({
      estApyLabel: '+9%',
      hasTargetAllocation: true,
      backtest: {
        returnLabel: '+9%',
        vsBtcLabel: '12 trades',
        vsEthLabel: 'Max DD 4%',
        metrics,
        chartData: [100, 109],
        displayName: 'Live strategy',
      },
    });
    expect(result.data?.pillars.map((row) => row.weight)).toEqual([
      40.4, 40, 19.6,
    ]);
    expect(result.data?.backtest.allocation.map((row) => row.pct)).toEqual([
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

    expect(useStrategyData('user-1', true)).toMatchObject({
      isLoading: true,
      isError: false,
    });

    mocks.backtest.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    expect(useStrategyData('user-1', true).isError).toBe(true);
  });
});
