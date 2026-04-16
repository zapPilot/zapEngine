import { useQuery } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, Mock, vi } from "vitest";

import {
  strategyConfigKeys,
  useStrategyConfigs,
} from "@/components/wallet/portfolio/views/invest/trading/hooks/useStrategyConfigs";
import { getStrategyConfigs } from "@/services/strategyService";
import type { StrategyConfigsResponse } from "@/types/strategy";

vi.mock("@tanstack/react-query", async importOriginal => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: vi.fn(),
  };
});

vi.mock("@/services/strategyService", () => ({
  getStrategyConfigs: vi.fn(),
}));

const mockConfigsResponse: StrategyConfigsResponse = {
  strategies: [],
  presets: [
    {
      config_id: "dma_gated_fgi_default",
      display_name: "DMA Gated FGI Default",
      description: "Curated DMA-first preset",
      strategy_id: "dma_gated_fgi",
      params: {
        signal: { cross_cooldown_days: 30 },
        pacing: { k: 5, r_max: 1 },
      },
      is_default: true,
      is_benchmark: false,
    },
  ],
  backtest_defaults: {
    days: 500,
    total_capital: 10000,
  },
};

describe("useStrategyConfigs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls useQuery with the correct options", () => {
    renderHook(() => useStrategyConfigs());

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["strategy-configs"],
        enabled: true,
        staleTime: 24 * 60 * 60 * 1000,
        gcTime: 48 * 60 * 60 * 1000,
        retry: 1,
      })
    );
  });

  it("uses getStrategyConfigs as the queryFn", () => {
    renderHook(() => useStrategyConfigs());

    const callArgs = (useQuery as Mock).mock.calls[0][0];
    callArgs.queryFn();

    expect(getStrategyConfigs).toHaveBeenCalled();
  });

  it("returns the query result", () => {
    (useQuery as Mock).mockReturnValue({
      data: mockConfigsResponse,
      isLoading: false,
      isError: false,
      error: null,
    });

    const { result } = renderHook(() => useStrategyConfigs());

    expect(result.current.data).toEqual(mockConfigsResponse);
    expect(result.current.isLoading).toBe(false);
  });

  it("supports enabled=false", () => {
    renderHook(() => useStrategyConfigs(false));

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
      })
    );
  });

  it("exports a stable query key", () => {
    expect(strategyConfigKeys.all).toEqual(["strategy-configs"]);
  });
});
