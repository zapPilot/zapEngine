/**
 * Unit tests for useAccountDeletion hook
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAccountDeletion } from "@/hooks/wallet/useAccountDeletion";

// Use vi.hoisted for mocks
const hoisted = vi.hoisted(() => ({
  mockDeleteUser: vi.fn(),
  mockShowToast: vi.fn(),
  mockDisconnect: vi.fn(),
  mockRefetch: vi.fn(),
  mockInvalidateQueries: vi.fn(),
  mockIsConnected: true,
}));

// Mock dependencies
vi.mock("@/services/accountService", () => ({
  deleteUser: hoisted.mockDeleteUser,
}));

vi.mock("@/providers/ToastProvider", () => ({
  useToast: () => ({ showToast: hoisted.mockShowToast }),
}));

vi.mock("@/providers/WalletProvider", () => ({
  useWalletProvider: () => ({
    disconnect: hoisted.mockDisconnect,
    isConnected: hoisted.mockIsConnected,
  }),
}));

vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ refetch: hoisted.mockRefetch }),
}));

vi.mock("@/lib/validation/walletUtils", () => ({
  handleWalletError: vi.fn((error: unknown) =>
    error instanceof Error ? error.message : "Unknown error"
  ),
}));

vi.mock("@/utils/logger", () => ({
  walletLogger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/constants/timings", () => ({
  TIMINGS: { MODAL_CLOSE_DELAY: 100 },
}));

vi.mock("@/constants/wallet", () => ({
  WALLET_MESSAGES: {
    DISCONNECT_WALLET: "Disconnect Wallet",
    DELETION_FAILED: "Deletion Failed",
  },
}));

// Create test query wrapper
function createTestQueryWrapper(queryClient: QueryClient) {
  const TestQueryWrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  TestQueryWrapper.displayName = "TestQueryWrapper";
  return TestQueryWrapper;
}

describe("useAccountDeletion", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    hoisted.mockDeleteUser.mockResolvedValue({ success: true });
    hoisted.mockDisconnect.mockResolvedValue(undefined);
    hoisted.mockRefetch.mockResolvedValue(undefined);
    hoisted.mockIsConnected = true;

    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...window.location,
        reload: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("should return initial state correctly", () => {
    const { result } = renderHook(
      () => useAccountDeletion({ userId: "user-123" }),
      { wrapper: createTestQueryWrapper(queryClient) }
    );

    expect(result.current.isDeletingAccount).toBe(false);
    expect(typeof result.current.handleDeleteAccount).toBe("function");
  });

  it("should delete account successfully", async () => {
    const { result } = renderHook(
      () => useAccountDeletion({ userId: "user-123" }),
      { wrapper: createTestQueryWrapper(queryClient) }
    );

    await act(async () => {
      await result.current.handleDeleteAccount();
    });

    expect(hoisted.mockDeleteUser).toHaveBeenCalledWith("user-123");
    expect(hoisted.mockDisconnect).toHaveBeenCalled();
    expect(hoisted.mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "success",
        title: "Account Deleted",
      })
    );
  });

  it("should do nothing if userId is empty", async () => {
    const { result } = renderHook(() => useAccountDeletion({ userId: "" }), {
      wrapper: createTestQueryWrapper(queryClient),
    });

    await act(async () => {
      await result.current.handleDeleteAccount();
    });

    expect(hoisted.mockDeleteUser).not.toHaveBeenCalled();
  });

  it("should handle disconnect error gracefully", async () => {
    hoisted.mockDisconnect.mockRejectedValue(new Error("Disconnect failed"));

    const { result } = renderHook(
      () => useAccountDeletion({ userId: "user-123" }),
      { wrapper: createTestQueryWrapper(queryClient) }
    );

    await act(async () => {
      await result.current.handleDeleteAccount();
    });

    expect(hoisted.mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "warning",
        title: "Disconnect Wallet",
      })
    );
  });

  it("should handle delete error", async () => {
    hoisted.mockDeleteUser.mockRejectedValue(new Error("Delete failed"));

    const { result } = renderHook(
      () => useAccountDeletion({ userId: "user-123" }),
      { wrapper: createTestQueryWrapper(queryClient) }
    );

    await act(async () => {
      await result.current.handleDeleteAccount();
    });

    expect(hoisted.mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        title: "Deletion Failed",
      })
    );
    expect(result.current.isDeletingAccount).toBe(false);
  });

  it("should handle refetch error gracefully", async () => {
    hoisted.mockRefetch.mockRejectedValue(new Error("Refetch failed"));

    const { result } = renderHook(
      () => useAccountDeletion({ userId: "user-123" }),
      { wrapper: createTestQueryWrapper(queryClient) }
    );

    // Should not throw
    await act(async () => {
      await result.current.handleDeleteAccount();
    });

    // Success toast should still be shown
    expect(hoisted.mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "success",
        title: "Account Deleted",
      })
    );
  });

  it("should reload page after successful deletion", async () => {
    const { result } = renderHook(
      () => useAccountDeletion({ userId: "user-123" }),
      { wrapper: createTestQueryWrapper(queryClient) }
    );

    await act(async () => {
      await result.current.handleDeleteAccount();
    });

    // Advance timer to trigger reload
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(window.location.reload).toHaveBeenCalled();
  });

  it("should not reload if disconnect fails", async () => {
    hoisted.mockDisconnect.mockRejectedValue(new Error("Disconnect failed"));

    const { result } = renderHook(
      () => useAccountDeletion({ userId: "user-123" }),
      { wrapper: createTestQueryWrapper(queryClient) }
    );

    await act(async () => {
      await result.current.handleDeleteAccount();
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(window.location.reload).not.toHaveBeenCalled();
  });
});
