/**
 * WalletProvider - Provider Tests
 *
 * Comprehensive test suite for wallet provider functionality.
 * Tests context provision, wagmi integration, state management, and error handling.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Import after mocks
import { useWalletProvider, WalletProvider } from "@/providers/WalletProvider";

// Mock wagmi hooks
const mockUseAccount = vi.fn();
const mockUseConnectors = vi.fn();
const mockUseBalance = vi.fn();
const mockConnectAsync = vi.fn();
const mockDisconnectAsync = vi.fn();
const mockSwitchChainAsync = vi.fn();
const mockSignMessageAsync = vi.fn();

vi.mock("wagmi", () => ({
  // wagmi v2: useAccount was renamed to useConnection
  useConnection: () => mockUseAccount(),
  // wagmi v2: connectors are enumerated via a dedicated hook
  useConnectors: () => mockUseConnectors(),
  useBalance: () => mockUseBalance(),
  // wagmi v2: mutation hooks use TanStack Mutation shape { mutateAsync, isPending }
  useConnect: () => ({
    mutateAsync: mockConnectAsync,
    isPending: false,
  }),
  useDisconnect: () => ({
    mutateAsync: mockDisconnectAsync,
    isPending: false,
  }),
  useSwitchChain: () => ({
    mutateAsync: mockSwitchChainAsync,
  }),
  useSignMessage: () => ({
    mutateAsync: mockSignMessageAsync,
  }),
}));

vi.mock("viem", () => ({
  formatUnits: (value: bigint, decimals: number) => {
    return (Number(value) / 10 ** decimals).toString();
  },
}));

// Mock logger
vi.mock("@/utils/logger", () => ({
  walletLogger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

async function invokeWalletProviderAction<T>(
  action: () => Promise<T>
): Promise<{ value: T | undefined; error: unknown }> {
  let value: T | undefined;
  let error: unknown;

  await act(async () => {
    try {
      value = await action();
    } catch (caughtError) {
      error = caughtError;
    }
  });

  return { value, error };
}

describe("WalletProvider", () => {
  const mockAddress = "0x1234567890123456789012345678901234567890";

  const mockChain = {
    id: 1,
    name: "Ethereum Mainnet",
    nativeCurrency: {
      name: "Ethereum",
      symbol: "ETH",
      decimals: 18,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations — disconnected state
    mockUseAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
      isConnecting: false,
      chain: undefined,
    });
    mockUseConnectors.mockReturnValue([{ id: "injected", name: "MetaMask" }]);
    mockUseBalance.mockReturnValue({ data: undefined, isLoading: false });
    mockConnectAsync.mockResolvedValue(undefined);
    mockDisconnectAsync.mockResolvedValue(undefined);
    mockSwitchChainAsync.mockResolvedValue(undefined);
    mockSignMessageAsync.mockResolvedValue("0xsignature");
  });

  describe("Provider rendering", () => {
    it("should provide context value to children", () => {
      const { result } = renderHook(() => useWalletProvider(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <WalletProvider>{children}</WalletProvider>
        ),
      });

      expect(result.current).toBeDefined();
      expect(result.current.account).toBeNull();
      expect(result.current.chain).toBeNull();
      expect(result.current.isConnected).toBe(false);
    });
  });

  describe("useWalletProvider hook", () => {
    it("should throw error when used outside provider", () => {
      expect(() => {
        renderHook(() => useWalletProvider());
      }).toThrow("useWalletProvider must be used within a WalletProvider");
    });

    it("should return context value when used inside provider", () => {
      const { result } = renderHook(() => useWalletProvider(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <WalletProvider>{children}</WalletProvider>
        ),
      });

      expect(result.current).toHaveProperty("account");
      expect(result.current).toHaveProperty("chain");
      expect(result.current).toHaveProperty("connect");
      expect(result.current).toHaveProperty("disconnect");
      expect(result.current).toHaveProperty("switchChain");
      expect(result.current).toHaveProperty("signMessage");
      expect(result.current).toHaveProperty("isConnected");
      expect(result.current).toHaveProperty("error");
      expect(result.current).toHaveProperty("clearError");
    });
  });

  describe("Wallet connection states", () => {
    it("should show disconnected state by default", () => {
      const { result } = renderHook(() => useWalletProvider(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <WalletProvider>{children}</WalletProvider>
        ),
      });

      expect(result.current.isConnected).toBe(false);
      expect(result.current.isConnecting).toBe(false);
      expect(result.current.isDisconnecting).toBe(false);
      expect(result.current.account).toBeNull();
    });

    it("should show connected state when account is present", () => {
      mockUseAccount.mockReturnValue({
        address: mockAddress,
        isConnected: true,
        isConnecting: false,
        chain: mockChain,
      });
      mockUseBalance.mockReturnValue({
        data: {
          value: BigInt("1500000000000000000"),
          decimals: 18,
          symbol: "ETH",
        },
      });

      const { result } = renderHook(() => useWalletProvider(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <WalletProvider>{children}</WalletProvider>
        ),
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.account).toEqual({
        address: mockAddress,
        isConnected: true,
        balance: "1.5",
      });
    });
  });

  describe("Account state transformation", () => {
    it("should return null account when not connected", () => {
      const { result } = renderHook(() => useWalletProvider(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <WalletProvider>{children}</WalletProvider>
        ),
      });

      expect(result.current.account).toBeNull();
    });

    it("should transform account with balance", () => {
      mockUseAccount.mockReturnValue({
        address: mockAddress,
        isConnected: true,
        isConnecting: false,
        chain: mockChain,
      });
      mockUseBalance.mockReturnValue({
        data: {
          value: BigInt("1500000000000000000"),
          decimals: 18,
          symbol: "ETH",
        },
      });

      const { result } = renderHook(() => useWalletProvider(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <WalletProvider>{children}</WalletProvider>
        ),
      });

      expect(result.current.account).toEqual({
        address: mockAddress,
        isConnected: true,
        balance: "1.5",
      });
    });

    it("should default balance to '0' when no balance data", () => {
      mockUseAccount.mockReturnValue({
        address: mockAddress,
        isConnected: true,
        isConnecting: false,
        chain: mockChain,
      });
      mockUseBalance.mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useWalletProvider(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <WalletProvider>{children}</WalletProvider>
        ),
      });

      expect(result.current.account?.balance).toBe("0");
    });
  });

  describe("Chain state transformation", () => {
    it("should return null chain when not connected", () => {
      const { result } = renderHook(() => useWalletProvider(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <WalletProvider>{children}</WalletProvider>
        ),
      });

      expect(result.current.chain).toBeNull();
    });

    it("should transform chain with full data", () => {
      mockUseAccount.mockReturnValue({
        address: mockAddress,
        isConnected: true,
        isConnecting: false,
        chain: mockChain,
      });
      mockUseBalance.mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useWalletProvider(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <WalletProvider>{children}</WalletProvider>
        ),
      });

      expect(result.current.chain).toEqual({
        id: 1,
        name: "Ethereum Mainnet",
        symbol: "ETH",
      });
    });

    it("should use fallback name when chain name is missing", () => {
      mockUseAccount.mockReturnValue({
        address: mockAddress,
        isConnected: true,
        isConnecting: false,
        chain: { id: 137, nativeCurrency: { symbol: "MATIC", decimals: 18 } },
      });
      mockUseBalance.mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useWalletProvider(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <WalletProvider>{children}</WalletProvider>
        ),
      });

      expect(result.current.chain?.name).toBe("Chain 137");
    });

    it("should use fallback symbol when currency symbol is missing", () => {
      mockUseAccount.mockReturnValue({
        address: mockAddress,
        isConnected: true,
        isConnecting: false,
        chain: { id: 1, name: "Ethereum", nativeCurrency: { decimals: 18 } },
      });
      mockUseBalance.mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useWalletProvider(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <WalletProvider>{children}</WalletProvider>
        ),
      });

      expect(result.current.chain?.symbol).toBe("ETH");
    });
  });

  describe("Wallet list (single-account model)", () => {
    it("should return empty wallet list when not connected", () => {
      const { result } = renderHook(() => useWalletProvider(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <WalletProvider>{children}</WalletProvider>
        ),
      });

      expect(result.current.connectedWallets).toEqual([]);
      expect(result.current.hasMultipleWallets).toBe(false);
    });

    it("should return single wallet when connected", () => {
      mockUseAccount.mockReturnValue({
        address: mockAddress,
        isConnected: true,
        isConnecting: false,
        chain: mockChain,
      });
      mockUseBalance.mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useWalletProvider(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <WalletProvider>{children}</WalletProvider>
        ),
      });

      expect(result.current.connectedWallets).toEqual([
        { address: mockAddress, isActive: true },
      ]);
      expect(result.current.hasMultipleWallets).toBe(false);
    });

    it("switchActiveWallet should be a no-op", async () => {
      mockUseAccount.mockReturnValue({
        address: mockAddress,
        isConnected: true,
        isConnecting: false,
        chain: mockChain,
      });
      mockUseBalance.mockReturnValue({ data: undefined });

      const { result } = renderHook(() => useWalletProvider(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <WalletProvider>{children}</WalletProvider>
        ),
      });

      // Should not throw
      await invokeWalletProviderAction(() =>
        result.current.switchActiveWallet("0xother")
      );
    });
  });

  describe("Connect function", () => {
    it("should call connectAsync with first connector", async () => {
      const { result } = renderHook(() => useWalletProvider(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <WalletProvider>{children}</WalletProvider>
        ),
      });

      await invokeWalletProviderAction(() => result.current.connect());

      expect(mockConnectAsync).toHaveBeenCalledWith({
        connector: { id: "injected", name: "MetaMask" },
      });
    });

    it("should set error state on connection failure", async () => {
      mockConnectAsync.mockRejectedValue(new Error("User rejected"));

      const { result } = renderHook(() => useWalletProvider(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <WalletProvider>{children}</WalletProvider>
        ),
      });

      const { error } = await invokeWalletProviderAction(() =>
        result.current.connect()
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("User rejected");

      await waitFor(() => {
        expect(result.current.error).toEqual({
          message: "User rejected",
          code: "CONNECT_ERROR",
        });
      });
    });

    it("should clear previous errors before connecting", async () => {
      mockConnectAsync
        .mockRejectedValueOnce(new Error("First error"))
        .mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useWalletProvider(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <WalletProvider>{children}</WalletProvider>
        ),
      });

      // First attempt fails
      const firstAttempt = await invokeWalletProviderAction(() =>
        result.current.connect()
      );
      expect(firstAttempt.error).toBeInstanceOf(Error);
      expect(result.current.error).toBeDefined();

      // Second attempt succeeds
      await invokeWalletProviderAction(() => result.current.connect());
      expect(result.current.error).toBeNull();
    });
  });

  describe("Disconnect function", () => {
    it("should call disconnectAsync", async () => {
      const { result } = renderHook(() => useWalletProvider(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <WalletProvider>{children}</WalletProvider>
        ),
      });

      await invokeWalletProviderAction(() => result.current.disconnect());

      expect(mockDisconnectAsync).toHaveBeenCalled();
    });

    it("should handle disconnect errors", async () => {
      mockDisconnectAsync.mockRejectedValue(new Error("Disconnect failed"));

      const { result } = renderHook(() => useWalletProvider(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <WalletProvider>{children}</WalletProvider>
        ),
      });

      const { error } = await invokeWalletProviderAction(() =>
        result.current.disconnect()
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Disconnect failed");

      await waitFor(() => {
        expect(result.current.error).toEqual({
          message: "Disconnect failed",
          code: "DISCONNECT_ERROR",
        });
      });
    });
  });

  describe("Switch chain function", () => {
    it("should switch to target chain", async () => {
      const { result } = renderHook(() => useWalletProvider(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <WalletProvider>{children}</WalletProvider>
        ),
      });

      await invokeWalletProviderAction(() => result.current.switchChain(137));

      expect(mockSwitchChainAsync).toHaveBeenCalledWith({ chainId: 137 });
    });

    it("should throw error on chain switch failure", async () => {
      mockSwitchChainAsync.mockRejectedValue(
        new Error("User rejected chain switch")
      );

      const { result } = renderHook(() => useWalletProvider(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <WalletProvider>{children}</WalletProvider>
        ),
      });

      const { error } = await invokeWalletProviderAction(() =>
        result.current.switchChain(137)
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("User rejected chain switch");
    });
  });

  describe("Sign message function", () => {
    it("should sign message with active account", async () => {
      mockUseAccount.mockReturnValue({
        address: mockAddress,
        isConnected: true,
        isConnecting: false,
        chain: mockChain,
      });
      mockUseBalance.mockReturnValue({ data: undefined });
      mockSignMessageAsync.mockResolvedValue("0xsignature");

      const { result } = renderHook(() => useWalletProvider(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <WalletProvider>{children}</WalletProvider>
        ),
      });

      const { error, value } = await invokeWalletProviderAction(() =>
        result.current.signMessage("Hello, world!")
      );

      expect(mockSignMessageAsync).toHaveBeenCalledWith({
        message: "Hello, world!",
      });
      expect(error).toBeUndefined();
      expect(value).toBe("0xsignature");
    });

    it("should throw error when no account is connected", async () => {
      const { result } = renderHook(() => useWalletProvider(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <WalletProvider>{children}</WalletProvider>
        ),
      });

      const { error } = await invokeWalletProviderAction(() =>
        result.current.signMessage("test")
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("No account connected");
    });

    it("should throw error on signing failure", async () => {
      mockUseAccount.mockReturnValue({
        address: mockAddress,
        isConnected: true,
        isConnecting: false,
        chain: mockChain,
      });
      mockUseBalance.mockReturnValue({ data: undefined });
      mockSignMessageAsync.mockRejectedValue(
        new Error("User rejected signing")
      );

      const { result } = renderHook(() => useWalletProvider(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <WalletProvider>{children}</WalletProvider>
        ),
      });

      const { error } = await invokeWalletProviderAction(() =>
        result.current.signMessage("test")
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("User rejected signing");
    });
  });

  describe("Error management", () => {
    it("should clear error when clearError is called", async () => {
      mockConnectAsync.mockRejectedValue(new Error("Connection failed"));

      const { result } = renderHook(() => useWalletProvider(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <WalletProvider>{children}</WalletProvider>
        ),
      });

      // Trigger an error
      const { error } = await invokeWalletProviderAction(() =>
        result.current.connect()
      );
      expect(error).toBeInstanceOf(Error);
      expect(result.current.error).toBeDefined();

      // Clear the error
      act(() => {
        result.current.clearError();
      });

      await waitFor(() => {
        expect(result.current.error).toBeNull();
      });
    });

    it("should have no error by default", () => {
      const { result } = renderHook(() => useWalletProvider(), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <WalletProvider>{children}</WalletProvider>
        ),
      });

      expect(result.current.error).toBeNull();
    });
  });
});
