import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTransactionData } from "@/components/wallet/portfolio/modals/hooks/useTransactionData";
import { useChainQuery } from "@/hooks/queries/wallet/useChainQuery";
import { useTokenBalanceQuery } from "@/hooks/queries/wallet/useTokenBalanceQuery";
import { transactionServiceMock } from "@/services";

// Mock dependencies
vi.mock("@/hooks/queries/wallet/useChainQuery");
vi.mock("@/hooks/queries/wallet/useTokenBalanceQuery");
vi.mock("@/services", () => ({
  transactionServiceMock: {
    getSupportedTokens: vi.fn(),
  },
}));

describe("useTransactionData", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  const mockChains = [{ chainId: 1, name: "Ethereum" }];
  const mockTokens = [
    { address: "0xToken1", symbol: "TKN1", usdPrice: 10 },
    { address: "0xToken2", symbol: "TKN2", usdPrice: 20 },
  ];
  const mockBalance = { formatted: "100.0", value: BigInt(100) };

  it("should return initial state", () => {
    vi.mocked(useChainQuery).mockReturnValue({ data: mockChains } as any);
    vi.mocked(useTokenBalanceQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as any);

    const { result } = renderHook(
      () =>
        useTransactionData({
          isOpen: false,
          chainId: 1,
          tokenAddress: undefined,
          amount: "",
        }),
      { wrapper }
    );

    expect(result.current.chainList).toEqual(mockChains);
    expect(result.current.selectedChain).toEqual(mockChains[0]);
  });

  it("should fetch tokens for selected chain", async () => {
    vi.mocked(useChainQuery).mockReturnValue({ data: mockChains } as any);
    vi.mocked(transactionServiceMock.getSupportedTokens).mockResolvedValue(
      mockTokens
    );
    vi.mocked(useTokenBalanceQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as any);

    const { result } = renderHook(
      () =>
        useTransactionData({
          isOpen: true,
          chainId: 1,
          tokenAddress: undefined,
          amount: "",
        }),
      { wrapper }
    );

    await waitFor(() =>
      expect(result.current.availableTokens).toEqual(mockTokens)
    );

    // Defaults to first token if no address provided
    expect(result.current.selectedToken).toEqual(mockTokens[0]);
  });

  it("should select token by address", async () => {
    vi.mocked(useChainQuery).mockReturnValue({ data: mockChains } as any);
    vi.mocked(transactionServiceMock.getSupportedTokens).mockResolvedValue(
      mockTokens
    );
    vi.mocked(useTokenBalanceQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as any);

    const { result } = renderHook(
      () =>
        useTransactionData({
          isOpen: true,
          chainId: 1,
          tokenAddress: "0xToken2",
          amount: "",
        }),
      { wrapper }
    );

    await waitFor(() =>
      expect(result.current.selectedToken).toEqual(mockTokens[1])
    );
  });

  it("should calculate USD amount", async () => {
    vi.mocked(useChainQuery).mockReturnValue({ data: mockChains } as any);
    vi.mocked(transactionServiceMock.getSupportedTokens).mockResolvedValue(
      mockTokens
    );
    vi.mocked(useTokenBalanceQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as any);

    const { result } = renderHook(
      () =>
        useTransactionData({
          isOpen: true,
          chainId: 1,
          tokenAddress: "0xToken1", // Price 10
          amount: "5",
        }),
      { wrapper }
    );

    await waitFor(() =>
      expect(result.current.selectedToken).toEqual(mockTokens[0])
    );
    expect(result.current.usdAmount).toBe(50); // 5 * 10
  });

  it("should handle balance fetching", async () => {
    vi.mocked(useChainQuery).mockReturnValue({ data: mockChains } as any);
    vi.mocked(transactionServiceMock.getSupportedTokens).mockResolvedValue(
      mockTokens
    );
    vi.mocked(useTokenBalanceQuery).mockReturnValue({
      data: mockBalance,
      isLoading: false,
    } as any);

    const { result } = renderHook(
      () =>
        useTransactionData({
          isOpen: true,
          chainId: 1,
          tokenAddress: "0xToken1",
          amount: "",
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.availableTokens).toHaveLength(2));

    expect(result.current.balances["0xToken1"]).toEqual(mockBalance);
  });
});
