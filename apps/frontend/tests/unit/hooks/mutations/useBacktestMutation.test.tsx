import { useMutation } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useBacktestMutation } from "@/hooks/mutations/useBacktestMutation";
import { runBacktest } from "@/services/backtestingService";
import { BacktestRequest } from "@/types/backtesting";

// Mock dependencies
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useMutation: vi.fn(),
  };
});

vi.mock("@/services/backtestingService", () => ({
  runBacktest: vi.fn(),
}));

describe("useBacktestMutation", () => {
  const mockMutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMutation).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as any);
  });

  it("should initialize mutation with correct configuration", () => {
    renderHook(() => useBacktestMutation());

    expect(useMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        mutationFn: expect.any(Function),
      })
    );
  });

  it("should call runBacktest when mutation function is executed", async () => {
    renderHook(() => useBacktestMutation());

    const mutationOptions = vi.mocked(useMutation).mock.calls[0][0] as any;
    const mutationFn = mutationOptions.mutationFn;

    const mockRequest: BacktestRequest = {
      token_symbol: "BTC",
      total_capital: 10000,
      configs: [{ config_id: "dca_classic", strategy_id: "dca_classic" }],
    };

    await mutationFn(mockRequest);

    expect(runBacktest).toHaveBeenCalledWith(mockRequest);
  });
});
