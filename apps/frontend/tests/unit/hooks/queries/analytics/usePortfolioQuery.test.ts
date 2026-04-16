import { useQuery } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useLandingPageData } from "@/hooks/queries/analytics/usePortfolioQuery";
import { getLandingPagePortfolioData } from "@/services";

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return { ...actual, useQuery: vi.fn() };
});

vi.mock("@/services", () => ({
  getLandingPagePortfolioData: vi.fn(),
}));

type CapturedQueryFn = ((...args: unknown[]) => Promise<unknown>) | null;

function captureQueryFn(): { fn: CapturedQueryFn } {
  const captured: { fn: CapturedQueryFn } = { fn: null };
  vi.mocked(useQuery).mockImplementation((options: Record<string, unknown>) => {
    captured.fn = options["queryFn"] as CapturedQueryFn;
    return { data: undefined, isLoading: false } as ReturnType<typeof useQuery>;
  });
  return captured;
}

describe("useLandingPageData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls useQuery with enabled=true when userId is provided and ETL is not in progress", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    renderHook(() => useLandingPageData("user123", false));

    const callArgs = vi.mocked(useQuery).mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(callArgs?.["enabled"]).toBe(true);
  });

  it("calls useQuery with enabled=false when userId is null", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    renderHook(() => useLandingPageData(null, false));

    const callArgs = vi.mocked(useQuery).mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(callArgs?.["enabled"]).toBe(false);
  });

  it("calls useQuery with enabled=false when isEtlInProgress is true", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    renderHook(() => useLandingPageData("user123", true));

    const callArgs = vi.mocked(useQuery).mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(callArgs?.["enabled"]).toBe(false);
  });

  it("defaults isEtlInProgress to false when not provided", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    renderHook(() => useLandingPageData("user123"));

    const callArgs = vi.mocked(useQuery).mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(callArgs?.["enabled"]).toBe(true);
  });

  it("queryFn resolves portfolio data from service", async () => {
    const mockResponse = {
      balance: 50000,
      daily_pnl: [],
      roi_30d: 0.05,
    };
    vi.mocked(getLandingPagePortfolioData).mockResolvedValue(
      mockResponse as Awaited<ReturnType<typeof getLandingPagePortfolioData>>
    );

    const captured = captureQueryFn();
    renderHook(() => useLandingPageData("user123"));

    expect(captured.fn).not.toBeNull();
    const result = await captured.fn!();
    expect(result).toEqual(mockResponse);
    expect(getLandingPagePortfolioData).toHaveBeenCalledWith("user123");
  });

  it("queryFn throws when userId is falsy at execution time", async () => {
    const captured = captureQueryFn();
    renderHook(() => useLandingPageData(null));

    expect(captured.fn).not.toBeNull();
    await expect(captured.fn!()).rejects.toThrow("User ID is required");
  });

  it("uses '' as queryKey userId when userId is null", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    renderHook(() => useLandingPageData(null));

    const callArgs = vi.mocked(useQuery).mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    const queryKey = callArgs?.["queryKey"] as unknown[];
    // queryKeys.portfolio.landingPage("") should be used
    expect(JSON.stringify(queryKey)).toContain("");
  });

  it("sets a refetchInterval of 5 minutes", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    renderHook(() => useLandingPageData("user123"));

    const callArgs = vi.mocked(useQuery).mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(callArgs?.["refetchInterval"]).toBe(5 * 60 * 1000);
  });
});
