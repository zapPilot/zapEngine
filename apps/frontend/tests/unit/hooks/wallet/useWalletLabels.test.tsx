import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as WalletService from "@/components/WalletManager/services/WalletService";
import { useWalletLabels } from "@/hooks/wallet/useWalletLabels";
import * as validation from "@/lib/validation/walletUtils";

// Mock dependencies
vi.mock("@/components/WalletManager/services/WalletService");
vi.mock("@/lib/validation/walletUtils");

describe("useWalletLabels", () => {
  const mockSetWallets = vi.fn();
  const mockSetEditingWallet = vi.fn();
  const mockSetWalletOperationState = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultProps = {
    userId: "user-123",
    wallets: [
      {
        id: "wallet-1",
        address: "0x123",
        label: "Old Label",
        user_id: "user-123",
        wallet: "0x123",
        created_at: "2024-01-01",
      },
    ],
    setWallets: mockSetWallets,
    setEditingWallet: mockSetEditingWallet,
    setWalletOperationState: mockSetWalletOperationState,
  };

  it("should do nothing if userId or newLabel is invalid", async () => {
    const { result } = renderHook(() => useWalletLabels(defaultProps));

    await result.current.handleEditLabel("wallet-1", "");
    expect(mockSetEditingWallet).toHaveBeenCalledWith(null);
    expect(mockSetWallets).not.toHaveBeenCalled();
  });

  it("should do nothing when userId is empty (short-circuit || branch)", async () => {
    // Exercises the `!userId` true branch of `!userId || !newLabel.trim()`
    const { result } = renderHook(() =>
      useWalletLabels({ ...defaultProps, userId: "" })
    );

    await result.current.handleEditLabel("wallet-1", "New Label");
    expect(mockSetEditingWallet).toHaveBeenCalledWith(null);
    expect(mockSetWallets).not.toHaveBeenCalled();
  });

  it("uses UPDATE_LABEL_FAILED_ERROR when response.error is undefined", async () => {
    // Exercises the `response.error ?? UPDATE_LABEL_FAILED_ERROR` false branch
    vi.spyOn(WalletService, "updateWalletLabel").mockResolvedValue({
      success: false,
      // no error field → response.error is undefined → fallback message used
    });

    const { result } = renderHook(() => useWalletLabels(defaultProps));
    await result.current.handleEditLabel("wallet-1", "New Label");

    expect(mockSetWalletOperationState).toHaveBeenCalledWith(
      "editing",
      "wallet-1",
      expect.objectContaining({
        isLoading: false,
        error: "Failed to update wallet label",
      })
    );
  });

  it("should do nothing if wallet not found", async () => {
    const { result } = renderHook(() => useWalletLabels(defaultProps));

    await result.current.handleEditLabel("wallet-999", "New Label");
    expect(mockSetEditingWallet).toHaveBeenCalledWith(null);
    expect(mockSetWallets).not.toHaveBeenCalled();
  });

  it("should handle successful label update", async () => {
    vi.spyOn(WalletService, "updateWalletLabel").mockResolvedValue({
      success: true,
      message: "Updated",
    });

    const { result } = renderHook(() => useWalletLabels(defaultProps));

    await result.current.handleEditLabel("wallet-1", "New Label");

    // Optimistic update
    expect(mockSetWalletOperationState).toHaveBeenCalledWith(
      "editing",
      "wallet-1",
      expect.objectContaining({ isLoading: true })
    );
    expect(mockSetWallets).toHaveBeenCalled();
    expect(mockSetEditingWallet).toHaveBeenCalledWith(null);

    // Success state
    expect(mockSetWalletOperationState).toHaveBeenCalledWith(
      "editing",
      "wallet-1",
      expect.objectContaining({ isLoading: false, error: null })
    );
  });

  it("should rollback on API failure", async () => {
    vi.spyOn(WalletService, "updateWalletLabel").mockResolvedValue({
      success: false,
      error: "Failed",
    });

    const { result } = renderHook(() => useWalletLabels(defaultProps));

    await result.current.handleEditLabel("wallet-1", "New Label");

    expect(mockSetWallets).toHaveBeenCalledTimes(2); // Optimistic then rollback
    expect(mockSetWalletOperationState).toHaveBeenCalledWith(
      "editing",
      "wallet-1",
      expect.objectContaining({ isLoading: false, error: "Failed" })
    );
  });

  it("should rollback on exception", async () => {
    vi.spyOn(WalletService, "updateWalletLabel").mockRejectedValue(
      new Error("Crash")
    );
    vi.spyOn(validation, "handleWalletError").mockReturnValue("Crash error");

    const { result } = renderHook(() => useWalletLabels(defaultProps));

    await result.current.handleEditLabel("wallet-1", "New Label");

    expect(mockSetWallets).toHaveBeenCalledTimes(2); // Optimistic then rollback
    expect(mockSetWalletOperationState).toHaveBeenCalledWith(
      "editing",
      "wallet-1",
      expect.objectContaining({ isLoading: false, error: "Crash error" })
    );
  });
});
