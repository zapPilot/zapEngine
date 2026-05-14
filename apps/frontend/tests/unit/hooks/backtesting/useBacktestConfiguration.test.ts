import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useBacktestConfiguration } from '@/components/wallet/portfolio/views/backtesting/hooks/useBacktestConfiguration';
import { useBacktestMutation } from '@/hooks/mutations/useBacktestMutation';
import {
  getStrategyConfigs,
  type StrategyConfigsResponse,
} from '@/services/strategyService';

vi.mock('@/services/strategyService', () => ({
  getStrategyConfigs: vi.fn(),
}));

vi.mock('@/hooks/mutations/useBacktestMutation', () => ({
  useBacktestMutation: vi.fn(),
}));

type ResolveStrategyConfigs = (value: StrategyConfigsResponse) => void;

const defaultPreset = {
  config_id: 'dma_fgi_portfolio_rules_default',
  display_name: 'DMA/FGI Portfolio Rules',
  description: 'Curated portfolio-rules preset',
  strategy_id: 'dma_fgi_portfolio_rules',
  params: { pacing: { k: 5, r_max: 1 } },
  is_benchmark: false,
  is_default: true,
};

function createResolvableStrategyConfigs(): ResolveStrategyConfigs {
  let resolveStrategyConfigs!: ResolveStrategyConfigs;
  vi.mocked(getStrategyConfigs).mockReturnValue(
    new Promise<StrategyConfigsResponse>((resolve) => {
      resolveStrategyConfigs = resolve;
    }),
  );
  return resolveStrategyConfigs;
}

function buildStrategyConfigsResponse(
  overrides: Partial<StrategyConfigsResponse> = {},
): StrategyConfigsResponse {
  return {
    strategies: [],
    presets: [defaultPreset],
    backtest_defaults: { days: 120, total_capital: 15000 },
    ...overrides,
  };
}

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
    const resolve = createResolvableStrategyConfigs();

    renderHook(() => useBacktestConfiguration());

    expect(mockMutate).not.toHaveBeenCalled();

    resolve(buildStrategyConfigsResponse());

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps manual editor changes intact when late defaults arrive', async () => {
    const resolve = createResolvableStrategyConfigs();

    const { result } = renderHook(() => useBacktestConfiguration());

    act(() => {
      result.current.updateEditorValue('{"manual":true}');
    });

    resolve(
      buildStrategyConfigsResponse({
        presets: [],
        backtest_defaults: {
          days: 500,
          total_capital: 10000,
        },
      }),
    );

    await waitFor(() => {
      expect(result.current.isInitializing).toBe(false);
    });

    expect(result.current.editorValue).toBe('{"manual":true}');
  });
});
