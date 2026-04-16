import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  addWallet,
  removeWallet,
} from "@/components/WalletManager/services/WalletService";
import type {
  NewWallet,
  WalletOperations,
  WalletOperationStateSetter,
} from "@/components/WalletManager/types/wallet.types";
import { validateNewWallet } from "@/components/WalletManager/utils/validation";
import { useUser } from "@/contexts/UserContext";
import { invalidateAndRefetch } from "@/hooks/utils/useQueryInvalidation";
import { useWalletMutations } from "@/hooks/wallet/useWalletMutations";
import {
  handleWalletError,
  type WalletData,
} from "@/lib/validation/walletUtils";

import { act, renderHook, waitFor } from "../../../test-utils";

vi.mock("@/components/WalletManager/services/WalletService", () => ({
  addWallet: vi.fn(),
  removeWallet: vi.fn(),
}));

vi.mock("@/components/WalletManager/utils/validation", () => ({
  validateNewWallet: vi.fn(),
}));

vi.mock("@/contexts/UserContext", () => ({
  useUser: vi.fn(() => ({ refetch: vi.fn() })),
}));

vi.mock("@/hooks/utils/useQueryInvalidation", () => ({
  invalidateAndRefetch: vi.fn(),
}));

vi.mock("@/lib/validation/walletUtils", () => ({
  handleWalletError: vi.fn((error: unknown) =>
    error instanceof Error ? error.message : "Unknown error"
  ),
}));

interface HookProps {
  userId: string;
  operations: WalletOperations;
  setOperations: ReturnType<typeof vi.fn>;
  setWallets: ReturnType<typeof vi.fn>;
  setWalletOperationState: WalletOperationStateSetter;
  loadWallets: ReturnType<typeof vi.fn>;
}

type WalletOperationsUpdater =
  | WalletOperations
  | ((previous: WalletOperations) => WalletOperations);

const mockUserId = "0x1234567890123456789012345678901234567890";
const mockWalletId = "wallet-1";
const mockWallets: WalletData[] = [
  {
    id: "wallet-1",
    address: "0xabc",
    label: "Wallet 1",
    isMain: false,
    isActive: false,
    createdAt: "2024-01-01",
  },
  {
    id: "wallet-2",
    address: "0xdef",
    label: "Wallet 2",
    isMain: false,
    isActive: false,
    createdAt: "2024-01-02",
  },
];
const mockNewWallet: NewWallet = {
  address: "0x9876543210987654321098765432109876543210",
  label: "New Wallet",
};

function createOperationsState(): WalletOperations {
  return {
    adding: { isLoading: false, error: null },
    removing: {},
    editing: {},
    subscribing: { isLoading: false, error: null },
  };
}

function applyOperationsUpdater(
  updater: WalletOperationsUpdater,
  current: WalletOperations
): WalletOperations {
  if (typeof updater === "function") {
    return updater(current);
  }

  return updater;
}

describe("useWalletMutations", () => {
  let mockOperations: WalletOperations;
  let mockSetOperations: ReturnType<typeof vi.fn>;
  let mockSetWallets: ReturnType<typeof vi.fn>;
  let mockSetWalletOperationState: WalletOperationStateSetter;
  let mockLoadWallets: ReturnType<typeof vi.fn>;
  let mockRefetch: ReturnType<typeof vi.fn>;

  function renderUseWalletMutations(overrides: Partial<HookProps> = {}) {
    const props: HookProps = {
      userId: mockUserId,
      operations: mockOperations,
      setOperations: mockSetOperations,
      setWallets: mockSetWallets,
      setWalletOperationState: mockSetWalletOperationState,
      loadWallets: mockLoadWallets,
      ...overrides,
    };

    return renderHook(() => useWalletMutations(props));
  }

  beforeEach(() => {
    vi.clearAllMocks();

    mockOperations = createOperationsState();

    mockSetOperations = vi.fn((updater: WalletOperationsUpdater) => {
      mockOperations = applyOperationsUpdater(updater, mockOperations);
    });
    mockSetWallets = vi.fn();
    mockSetWalletOperationState = vi.fn() as WalletOperationStateSetter;
    mockLoadWallets = vi.fn().mockResolvedValue(undefined);
    mockRefetch = vi.fn().mockResolvedValue(undefined);

    vi.mocked(useUser).mockReturnValue({
      refetch: mockRefetch,
    } as ReturnType<typeof useUser>);
  });

  describe("handleDeleteWallet", () => {
    it("returns early when userId is missing", async () => {
      const { result } = renderUseWalletMutations({ userId: "" });

      await act(async () => {
        await result.current.handleDeleteWallet(mockWalletId);
      });

      expect(mockSetWalletOperationState).not.toHaveBeenCalled();
      expect(removeWallet).not.toHaveBeenCalled();
    });

    it("deletes wallet and updates optimistic and loading state", async () => {
      vi.mocked(removeWallet).mockResolvedValue({ success: true });

      const { result } = renderUseWalletMutations();

      await act(async () => {
        await result.current.handleDeleteWallet(mockWalletId);
      });

      expect(mockSetWalletOperationState).toHaveBeenCalledWith(
        "removing",
        mockWalletId,
        {
          isLoading: true,
          error: null,
        }
      );
      expect(removeWallet).toHaveBeenCalledWith(mockUserId, mockWalletId);

      expect(mockSetWallets).toHaveBeenCalledWith(expect.any(Function));
      const setWalletsUpdater = mockSetWallets.mock.calls[0][0] as (
        wallets: WalletData[]
      ) => WalletData[];
      expect(setWalletsUpdater(mockWallets)).toEqual([mockWallets[1]]);

      await waitFor(() => {
        expect(invalidateAndRefetch).toHaveBeenCalled();
      });

      expect(mockSetWalletOperationState).toHaveBeenCalledWith(
        "removing",
        mockWalletId,
        {
          isLoading: false,
          error: null,
        }
      );
    });

    it("stores API error message when deletion response fails with error", async () => {
      vi.mocked(removeWallet).mockResolvedValue({
        success: false,
        error: "Network error occurred",
      });

      const { result } = renderUseWalletMutations();

      await act(async () => {
        await result.current.handleDeleteWallet(mockWalletId);
      });

      expect(mockSetWalletOperationState).toHaveBeenCalledWith(
        "removing",
        mockWalletId,
        {
          isLoading: false,
          error: "Network error occurred",
        }
      );
    });

    it("uses default delete error when API failure has no message", async () => {
      vi.mocked(removeWallet).mockResolvedValue({ success: false });

      const { result } = renderUseWalletMutations();

      await act(async () => {
        await result.current.handleDeleteWallet(mockWalletId);
      });

      expect(mockSetWalletOperationState).toHaveBeenCalledWith(
        "removing",
        mockWalletId,
        {
          isLoading: false,
          error: "Failed to remove wallet",
        }
      );
    });

    it("maps exceptions through handleWalletError during deletion", async () => {
      const error = new Error("Exception occurred");
      vi.mocked(removeWallet).mockRejectedValue(error);
      vi.mocked(handleWalletError).mockReturnValue("Exception occurred");

      const { result } = renderUseWalletMutations();

      await act(async () => {
        await result.current.handleDeleteWallet(mockWalletId);
      });

      expect(handleWalletError).toHaveBeenCalledWith(error);
      expect(mockSetWalletOperationState).toHaveBeenCalledWith(
        "removing",
        mockWalletId,
        {
          isLoading: false,
          error: "Exception occurred",
        }
      );
    });
  });

  describe("handleAddWallet", () => {
    it("returns user-id validation error when userId is missing", async () => {
      const { result } = renderUseWalletMutations({ userId: "" });

      let addResult: Awaited<ReturnType<typeof result.current.handleAddWallet>>;
      await act(async () => {
        addResult = await result.current.handleAddWallet(mockNewWallet);
      });

      expect(addResult!).toEqual({
        success: false,
        error: "User ID is required",
      });
      expect(addWallet).not.toHaveBeenCalled();
    });

    it("returns validation error when new wallet data is invalid", async () => {
      vi.mocked(validateNewWallet).mockReturnValue({
        isValid: false,
        error: "Invalid address format",
      });

      const { result } = renderUseWalletMutations();

      let addResult: Awaited<ReturnType<typeof result.current.handleAddWallet>>;
      await act(async () => {
        addResult = await result.current.handleAddWallet(mockNewWallet);
      });

      expect(validateNewWallet).toHaveBeenCalledWith(mockNewWallet);
      expect(addResult!).toEqual({
        success: false,
        error: "Invalid address format",
      });
      expect(addWallet).not.toHaveBeenCalled();
    });

    it("adds wallet successfully and resets adding state", async () => {
      vi.mocked(validateNewWallet).mockReturnValue({ isValid: true });
      vi.mocked(addWallet).mockResolvedValue({ success: true });

      const { result } = renderUseWalletMutations();

      let addResult: Awaited<ReturnType<typeof result.current.handleAddWallet>>;
      await act(async () => {
        addResult = await result.current.handleAddWallet(mockNewWallet);
      });

      expect(addWallet).toHaveBeenCalledWith(
        mockUserId,
        mockNewWallet.address,
        mockNewWallet.label
      );

      await waitFor(() => {
        expect(mockLoadWallets).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(invalidateAndRefetch).toHaveBeenCalled();
      });

      expect(mockOperations.adding).toEqual({ isLoading: false, error: null });
      expect(addResult!).toEqual({ success: true });
    });

    it("returns API failure for wallet addition", async () => {
      vi.mocked(validateNewWallet).mockReturnValue({ isValid: true });
      vi.mocked(addWallet).mockResolvedValue({
        success: false,
        error: "Wallet already exists",
      });

      const { result } = renderUseWalletMutations();

      let addResult: Awaited<ReturnType<typeof result.current.handleAddWallet>>;
      await act(async () => {
        addResult = await result.current.handleAddWallet(mockNewWallet);
      });

      expect(addResult!).toEqual({
        success: false,
        error: "Wallet already exists",
      });
      expect(mockOperations.adding).toEqual({
        isLoading: false,
        error: "Wallet already exists",
      });
    });

    it("returns mapped exception from handleWalletError for wallet addition", async () => {
      const error = new Error("Network failure");
      vi.mocked(validateNewWallet).mockReturnValue({ isValid: true });
      vi.mocked(addWallet).mockRejectedValue(error);
      vi.mocked(handleWalletError).mockReturnValue("Network failure");

      const { result } = renderUseWalletMutations();

      let addResult: Awaited<ReturnType<typeof result.current.handleAddWallet>>;
      await act(async () => {
        addResult = await result.current.handleAddWallet(mockNewWallet);
      });

      expect(handleWalletError).toHaveBeenCalledWith(error);
      expect(addResult!).toEqual({ success: false, error: "Network failure" });
      expect(mockOperations.adding).toEqual({
        isLoading: false,
        error: "Network failure",
      });
    });
  });

  it("exposes operations.adding as addingState", () => {
    const customOperations: WalletOperations = {
      adding: { isLoading: true, error: "Test error" },
      removing: {},
      editing: {},
      subscribing: { isLoading: false, error: null },
    };

    const { result } = renderUseWalletMutations({
      operations: customOperations,
    });

    expect(result.current.addingState).toEqual({
      isLoading: true,
      error: "Test error",
    });
  });
});
