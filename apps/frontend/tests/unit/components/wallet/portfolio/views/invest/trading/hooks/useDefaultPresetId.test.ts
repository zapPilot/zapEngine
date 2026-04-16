import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDefaultPresetId } from "@/components/wallet/portfolio/views/invest/trading/hooks/useDefaultPresetId";
import { useStrategyConfigs } from "@/components/wallet/portfolio/views/invest/trading/hooks/useStrategyConfigs";
import type { StrategyConfigsResponse, StrategyPreset } from "@/types/strategy";

vi.mock(
  "@/components/wallet/portfolio/views/invest/trading/hooks/useStrategyConfigs",
  () => ({
    useStrategyConfigs: vi.fn(),
  })
);

function createPreset(
  overrides: Partial<StrategyPreset> & { config_id: string }
): StrategyPreset {
  return {
    config_id: overrides.config_id,
    display_name: "Preset",
    description: null,
    strategy_id: "dma_gated_fgi",
    params: {},
    is_default: false,
    is_benchmark: false,
    ...overrides,
  };
}

function mockUseStrategyConfigs(
  data: StrategyConfigsResponse | undefined | null
) {
  vi.mocked(useStrategyConfigs).mockReturnValue({
    data,
    isLoading: false,
    isSuccess: true,
    isError: false,
    error: null,
  } as any);
}

describe("useDefaultPresetId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns undefined while configs are unavailable", () => {
    mockUseStrategyConfigs(undefined);

    const { result } = renderHook(() => useDefaultPresetId(true));

    expect(result.current).toBeUndefined();
  });

  it("prefers the backend default flag before the curated rotation fallback", () => {
    mockUseStrategyConfigs({
      strategies: [],
      presets: [
        createPreset({ config_id: "dma_gated_fgi_default" }),
        createPreset({
          config_id: "eth_btc_rotation_default",
          strategy_id: "eth_btc_rotation",
          is_default: true,
        }),
      ],
      backtest_defaults: { days: 500, total_capital: 10000 },
    });

    const { result } = renderHook(() => useDefaultPresetId(true));

    expect(result.current).toBe("eth_btc_rotation_default");
  });

  it("falls back to the curated rotation id when no preset is flagged as default", () => {
    mockUseStrategyConfigs({
      strategies: [],
      presets: [
        createPreset({ config_id: "dca_classic", strategy_id: "dca_classic" }),
        createPreset({
          config_id: "eth_btc_rotation_default",
          strategy_id: "eth_btc_rotation",
        }),
      ],
      backtest_defaults: { days: 500, total_capital: 10000 },
    });

    const { result } = renderHook(() => useDefaultPresetId(true));

    expect(result.current).toBe("eth_btc_rotation_default");
  });

  it("falls back to the first eth_btc_rotation preset", () => {
    mockUseStrategyConfigs({
      strategies: [],
      presets: [
        createPreset({ config_id: "dca_classic", strategy_id: "dca_classic" }),
        createPreset({
          config_id: "rotation_alt_1",
          strategy_id: "eth_btc_rotation",
        }),
        createPreset({
          config_id: "rotation_alt_2",
          strategy_id: "eth_btc_rotation",
        }),
      ],
      backtest_defaults: { days: 500, total_capital: 10000 },
    });

    const { result } = renderHook(() => useDefaultPresetId(true));

    expect(result.current).toBe("rotation_alt_1");
  });

  it("falls back to the first preset when there is no DMA strategy", () => {
    mockUseStrategyConfigs({
      strategies: [],
      presets: [
        createPreset({
          config_id: "dca_classic",
          strategy_id: "dca_classic",
          is_benchmark: true,
        }),
      ],
      backtest_defaults: { days: 500, total_capital: 10000 },
    });

    const { result } = renderHook(() => useDefaultPresetId(true));

    expect(result.current).toBe("dca_classic");
  });

  it("passes enabled through to useStrategyConfigs", () => {
    mockUseStrategyConfigs({
      strategies: [],
      presets: [],
      backtest_defaults: { days: 500, total_capital: 10000 },
    });

    renderHook(() => useDefaultPresetId(false));

    expect(useStrategyConfigs).toHaveBeenCalledWith(false);
  });
});
