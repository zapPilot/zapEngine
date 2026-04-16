import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTokenBalanceQuery } from "@/hooks/queries/wallet/useTokenBalanceQuery";

const { mockGetTokenBalance } = vi.hoisted(() => ({
  mockGetTokenBalance: vi.fn(),
}));
let mockAccount: { address: string } | undefined;

vi.mock("@/providers/WalletProvider", () => ({
  useWalletProvider: () => ({
    account: mockAccount,
  }),
}));

vi.mock("@/services", () => ({
  transactionServiceMock: {
    getTokenBalance: mockGetTokenBalance,
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  Wrapper.displayName = "TokenBalanceQueryWrapper";

  return { Wrapper, queryClient };
};

describe("useTokenBalanceQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccount = {
      address: "0x1234567890abcdef1234567890abcdef12345678",
    };
    mockGetTokenBalance.mockResolvedValue({
      balance: "1000000000000000000",
      usdValue: 2500,
    });
  });

  it("fetches token balance when chain, token, and account are present", async () => {
    const chainId = 42161;
    const tokenAddress = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";
    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () => useTokenBalanceQuery(chainId, tokenAddress),
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockGetTokenBalance).toHaveBeenCalledWith(chainId, tokenAddress);
    expect(result.current.data).toEqual({
      balance: "1000000000000000000",
      usdValue: 2500,
    });
  });

  it("uses the connected wallet address in the query key", async () => {
    const chainId = 1;
    const tokenAddress = "0xtoken";
    const { Wrapper, queryClient } = createWrapper();

    renderHook(() => useTokenBalanceQuery(chainId, tokenAddress), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(mockGetTokenBalance).toHaveBeenCalledWith(chainId, tokenAddress);
    });

    const query = queryClient.getQueryCache().find({
      queryKey: [
        "token-balance",
        chainId,
        tokenAddress,
        mockAccount?.address ?? "no-account",
      ],
    });

    expect(query?.queryKey).toEqual([
      "token-balance",
      chainId,
      tokenAddress,
      mockAccount?.address ?? "no-account",
    ]);
  });

  it("does not fetch when chainId is undefined", () => {
    const { Wrapper, queryClient } = createWrapper();

    const { result } = renderHook(
      () => useTokenBalanceQuery(undefined, "0xtoken"),
      { wrapper: Wrapper }
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockGetTokenBalance).not.toHaveBeenCalled();
    expect(queryClient.getQueryCache().findAll()[0]?.queryKey).toEqual([
      "token-balance",
      undefined,
      "0xtoken",
      mockAccount?.address ?? "no-account",
    ]);
  });

  it("does not fetch when tokenAddress is undefined", () => {
    const { Wrapper, queryClient } = createWrapper();

    const { result } = renderHook(
      () => useTokenBalanceQuery(42161, undefined),
      { wrapper: Wrapper }
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockGetTokenBalance).not.toHaveBeenCalled();
    expect(queryClient.getQueryCache().findAll()[0]?.queryKey).toEqual([
      "token-balance",
      42161,
      undefined,
      mockAccount?.address ?? "no-account",
    ]);
  });

  it("does not fetch when the connected account is missing", () => {
    mockAccount = undefined;
    const { Wrapper, queryClient } = createWrapper();

    const { result } = renderHook(
      () => useTokenBalanceQuery(42161, "0xtoken"),
      { wrapper: Wrapper }
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockGetTokenBalance).not.toHaveBeenCalled();
    expect(queryClient.getQueryCache().findAll()[0]?.queryKey).toEqual([
      "token-balance",
      42161,
      "0xtoken",
      "no-account",
    ]);
  });

  it("respects the enabled option override", () => {
    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () =>
        useTokenBalanceQuery(42161, "0xtoken", {
          enabled: false,
        }),
      { wrapper: Wrapper }
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockGetTokenBalance).not.toHaveBeenCalled();
  });

  it("propagates service errors for valid enabled queries", async () => {
    const mockError = new Error("Balance lookup failed");
    mockGetTokenBalance.mockRejectedValue(mockError);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () => useTokenBalanceQuery(42161, "0xtoken"),
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBe(mockError);
  });
});
