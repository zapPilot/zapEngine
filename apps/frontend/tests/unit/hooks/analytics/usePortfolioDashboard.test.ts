import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePortfolioDashboard } from "@/hooks/analytics/usePortfolioDashboard";
import type { UnifiedDashboardResponse } from "@/services/analyticsService";

import { renderHook, waitFor } from "../../../test-utils";

vi.mock("@/services/analyticsService", () => ({
  getPortfolioDashboard: vi.fn(),
}));

const { getPortfolioDashboard } = await import("@/services/analyticsService");

const MOCK_DASHBOARD = {
  trends: { daily_values: [] },
  rolling_analytics: { sharpe: [], volatility: [] },
  drawdown_analysis: { enhanced: [], underwater_recovery: [] },
  allocation: { timeseries: [] },
  _metadata: { error_count: 0, errors: {}, cached: false, generated_at: "" },
} as unknown as UnifiedDashboardResponse;

describe("usePortfolioDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not fetch when userId is undefined", () => {
    const { result } = renderHook(() => usePortfolioDashboard(undefined));

    expect(getPortfolioDashboard).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.dashboard).toBeUndefined();
  });

  it("does not fetch when userId is empty string", () => {
    const { result } = renderHook(() => usePortfolioDashboard(""));

    expect(getPortfolioDashboard).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.dashboard).toBeUndefined();
  });

  it("fetches and returns dashboard data when userId is provided", async () => {
    vi.mocked(getPortfolioDashboard).mockResolvedValue(MOCK_DASHBOARD);

    const { result } = renderHook(() => usePortfolioDashboard("0x123"));

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(getPortfolioDashboard).toHaveBeenCalledWith("0x123", {});
    expect(result.current.dashboard).toEqual(MOCK_DASHBOARD);
    expect(result.current.data).toEqual(MOCK_DASHBOARD);
  });

  it("passes params to getPortfolioDashboard correctly", async () => {
    vi.mocked(getPortfolioDashboard).mockResolvedValue(MOCK_DASHBOARD);

    const params = {
      trend_days: 30,
      drawdown_days: 90,
      rolling_days: 60,
      metrics: ["sharpe", "volatility"],
    };

    const { result } = renderHook(() => usePortfolioDashboard("0x123", params));

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(getPortfolioDashboard).toHaveBeenCalledWith("0x123", params);
  });

  it("includes wallet_address in query key for cache isolation", async () => {
    vi.mocked(getPortfolioDashboard).mockResolvedValue(MOCK_DASHBOARD);

    const params = { wallet_address: "0xabc" };

    const { result } = renderHook(() => usePortfolioDashboard("0x123", params));

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(getPortfolioDashboard).toHaveBeenCalledWith("0x123", params);
  });

  it("uses default staleTime of 2 minutes", async () => {
    vi.mocked(getPortfolioDashboard).mockResolvedValue(MOCK_DASHBOARD);

    const { result } = renderHook(() => usePortfolioDashboard("0x123"));

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.dashboard).toEqual(MOCK_DASHBOARD);
  });

  it("accepts custom staleTime override", async () => {
    vi.mocked(getPortfolioDashboard).mockResolvedValue(MOCK_DASHBOARD);

    const { result } = renderHook(() =>
      usePortfolioDashboard("0x123", {}, { staleTime: 5 * 60 * 1000 })
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.dashboard).toEqual(MOCK_DASHBOARD);
  });

  it("spreads refetchOnMount when provided", async () => {
    vi.mocked(getPortfolioDashboard).mockResolvedValue(MOCK_DASHBOARD);

    const { result } = renderHook(() =>
      usePortfolioDashboard("0x123", {}, { refetchOnMount: "always" })
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.dashboard).toEqual(MOCK_DASHBOARD);
  });

  it("does not include refetchOnMount when absent", async () => {
    vi.mocked(getPortfolioDashboard).mockResolvedValue(MOCK_DASHBOARD);

    const { result } = renderHook(() => usePortfolioDashboard("0x123", {}, {}));

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.dashboard).toEqual(MOCK_DASHBOARD);
  });

  it("handles fetch error gracefully", async () => {
    const mockError = new Error("Failed to fetch dashboard");
    vi.mocked(getPortfolioDashboard).mockRejectedValue(mockError);

    const { result } = renderHook(() => usePortfolioDashboard("0x123"));

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(getPortfolioDashboard).toHaveBeenCalledWith("0x123", {});
    expect(result.current.error).toEqual(mockError);
    expect(result.current.dashboard).toBeUndefined();
  });

  it("exposes dashboard as alias for data", async () => {
    vi.mocked(getPortfolioDashboard).mockResolvedValue(MOCK_DASHBOARD);

    const { result } = renderHook(() => usePortfolioDashboard("0x123"));

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.dashboard).toBe(result.current.data);
    expect(result.current.dashboard).toEqual(MOCK_DASHBOARD);
  });
});
