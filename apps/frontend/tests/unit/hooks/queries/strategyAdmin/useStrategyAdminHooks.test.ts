import { useQuery } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useStrategyAdminConfig } from "@/hooks/queries/strategyAdmin/useStrategyAdminConfig";
import { useStrategyAdminConfigs } from "@/hooks/queries/strategyAdmin/useStrategyAdminConfigs";
import { getStrategyAdminConfig, getStrategyAdminConfigs } from "@/services";

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return { ...actual, useQuery: vi.fn() };
});

vi.mock("@/services", () => ({
  getStrategyAdminConfig: vi.fn(),
  getStrategyAdminConfigs: vi.fn(),
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

describe("useStrategyAdminConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls useQuery with enabled=false when configId is null", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    renderHook(() => useStrategyAdminConfig(null));

    const callArgs = vi.mocked(useQuery).mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(callArgs?.["enabled"]).toBe(false);
  });

  it("calls useQuery with enabled=true when configId is a non-empty string", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    renderHook(() => useStrategyAdminConfig("some_config_id"));

    const callArgs = vi.mocked(useQuery).mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(callArgs?.["enabled"]).toBe(true);
  });

  it("queryFn resolves to response.config", async () => {
    const mockConfig = { config_id: "abc", params: {} };
    vi.mocked(getStrategyAdminConfig).mockResolvedValue({
      config: mockConfig,
    } as Awaited<ReturnType<typeof getStrategyAdminConfig>>);

    const captured = captureQueryFn();
    renderHook(() => useStrategyAdminConfig("abc"));

    expect(captured.fn).not.toBeNull();
    const result = await captured.fn!();
    expect(result).toEqual(mockConfig);
    expect(getStrategyAdminConfig).toHaveBeenCalledWith("abc");
  });

  it("includes the configId in the queryKey", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    renderHook(() => useStrategyAdminConfig("test_config"));

    const callArgs = vi.mocked(useQuery).mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    const queryKey = callArgs?.["queryKey"] as unknown[];
    expect(JSON.stringify(queryKey)).toContain("test_config");
  });
});

describe("useStrategyAdminConfigs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls useQuery (always enabled)", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    renderHook(() => useStrategyAdminConfigs());

    expect(useQuery).toHaveBeenCalledOnce();
  });

  it("queryFn resolves to response.configs", async () => {
    const mockConfigs = [{ config_id: "cfg1", params: {} }];
    vi.mocked(getStrategyAdminConfigs).mockResolvedValue({
      configs: mockConfigs,
    } as Awaited<ReturnType<typeof getStrategyAdminConfigs>>);

    const captured = captureQueryFn();
    renderHook(() => useStrategyAdminConfigs());

    expect(captured.fn).not.toBeNull();
    const result = await captured.fn!();
    expect(result).toEqual(mockConfigs);
    expect(getStrategyAdminConfigs).toHaveBeenCalledOnce();
  });

  it("uses a staleTime of 30 seconds", () => {
    vi.mocked(useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useQuery>);

    renderHook(() => useStrategyAdminConfigs());

    const callArgs = vi.mocked(useQuery).mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(callArgs?.["staleTime"]).toBe(30 * 1000);
  });
});
