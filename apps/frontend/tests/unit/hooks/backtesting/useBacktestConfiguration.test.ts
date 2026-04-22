import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useBacktestConfiguration } from '@/components/wallet/portfolio/views/backtesting/hooks/useBacktestConfiguration';
import { useBacktestMutation } from '@/hooks/mutations/useBacktestMutation';
import { getStrategyConfigs } from '@/services/strategyService';

vi.mock('@/services/strategyService', () => ({
  getStrategyConfigs: vi.fn(),
}));

vi.mock('@/hooks/mutations/useBacktestMutation', () => ({
  useBacktestMutation: vi.fn(),
}));

describe('useBacktestConfiguration regressions', () => {
  const mockMutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useBacktestMutation).mockReturnValue({
      mutate: mockMutate,
      data: null,
      isPending: false,
      error: null,
    } as any);
  });

  it('waits for defaults before the initial compare run', async () => {
    let resolvePresets: ((value: any) => void) | undefined;

    vi.mocked(getStrategyConfigs).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePresets = resolve;
        }),
    );

    renderHook(() => useBacktestConfiguration());

    expect(mockMutate).not.toHaveBeenCalled();

    resolvePresets?.({
      strategies: [],
      presets: [
        {
          config_id: 'eth_btc_rotation_default',
          display_name: 'ETH/BTC RS Rotation',
          description: 'Curated rotation preset',
          strategy_id: 'eth_btc_rotation',
          params: { pacing: { k: 5, r_max: 1 } },
          is_benchmark: false,
          is_default: true,
        },
      ],
      backtest_defaults: {
        days: 120,
        total_capital: 15000,
      },
    });

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps manual editor changes intact when late defaults arrive', async () => {
    vi.mocked(getStrategyConfigs).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                strategies: [],
                presets: [],
                backtest_defaults: {
                  days: 500,
                  total_capital: 10000,
                },
              }),
            50,
          );
        }),
    );

    const { result } = renderHook(() => useBacktestConfiguration());

    act(() => {
      result.current.updateEditorValue('{"manual":true}');
    });

    await waitFor(() => {
      expect(getStrategyConfigs).toHaveBeenCalled();
    });

    expect(result.current.editorValue).toBe('{"manual":true}');
  });
});
