import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UserCryptoWallet } from "@/schemas/api/accountSchemas";
import * as accountService from "@/services/accountService";
import * as walletService from "@/services/walletService";

// Mock account service functions
vi.mock("@/services/accountService", () => ({
  getUserWallets: vi.fn(),
  addWalletToBundle: vi.fn(),
  removeWalletFromBundle: vi.fn(),
  updateWalletLabel: vi.fn(),
  updateUserEmail: vi.fn(),
  removeUserEmail: vi.fn(),
}));

// Mock wallet utils transformation
vi.mock("@/lib/validation/walletUtils", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/validation/walletUtils")
  >("@/lib/validation/walletUtils");
  return {
    ...actual,
    transformWalletData: vi.fn((wallets: UserCryptoWallet[]) =>
      wallets.map(wallet => ({
        id: wallet.id,
        address: wallet.wallet,
        label: wallet.label || "Wallet",
        isMain: false,
        isActive: false,
        createdAt: wallet.created_at,
      }))
    ),
  };
});

describe("WalletService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loadWallets", () => {
    const mockUserWallets: UserCryptoWallet[] = [
      {
        id: "wallet1",
        user_id: "user123",
        wallet: "0x1234567890123456789012345678901234567890",
        label: "Main Wallet",
        created_at: "2024-01-01T00:00:00Z",
      },
      {
        id: "wallet2",
        user_id: "user123",
        wallet: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        created_at: "2024-01-02T00:00:00Z",
      },
    ];

    it("should fetch and transform wallets successfully", async () => {
      vi.mocked(accountService.getUserWallets).mockResolvedValue(
        mockUserWallets
      );

      const result = await walletService.loadWallets("user123");

      expect(accountService.getUserWallets).toHaveBeenCalledWith("user123");
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: "wallet1",
        address: "0x1234567890123456789012345678901234567890",
        label: "Main Wallet",
        isMain: false,
        isActive: false,
        createdAt: "2024-01-01T00:00:00Z",
      });
      expect(result[1]).toEqual({
        id: "wallet2",
        address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        label: "Wallet", // Default label when not provided
        isMain: false,
        isActive: false,
        createdAt: "2024-01-02T00:00:00Z",
      });
    });

    it("should handle empty wallet list", async () => {
      vi.mocked(accountService.getUserWallets).mockResolvedValue([]);

      const result = await walletService.loadWallets("user123");

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it("should return empty array when getUserWallets fails", async () => {
      vi.mocked(accountService.getUserWallets).mockRejectedValue(
        new Error("Network error")
      );

      const result = await walletService.loadWallets("user123");

      expect(result).toEqual([]);
      expect(accountService.getUserWallets).toHaveBeenCalledWith("user123");
    });

    it("should return empty array on API error (404)", async () => {
      const apiError = {
        status: 404,
        message: "User not found",
      };
      vi.mocked(accountService.getUserWallets).mockRejectedValue(apiError);

      const result = await walletService.loadWallets("nonexistent");

      expect(result).toEqual([]);
    });

    it("should transform wallets with default label when missing", async () => {
      const walletsWithoutLabels: UserCryptoWallet[] = [
        {
          id: "wallet1",
          user_id: "user123",
          wallet: "0x1234567890123456789012345678901234567890",
          created_at: "2024-01-01T00:00:00Z",
        },
      ];

      vi.mocked(accountService.getUserWallets).mockResolvedValue(
        walletsWithoutLabels
      );

      const result = await walletService.loadWallets("user123");

      expect(result[0].label).toBe("Wallet");
    });
  });

  describe("addWallet", () => {
    it("should add wallet successfully", async () => {
      vi.mocked(accountService.addWalletToBundle).mockResolvedValue({
        wallet_id: "wallet123",
        message: "Wallet added successfully",
      });

      const result = await walletService.addWallet(
        "user123",
        "0x1234567890123456789012345678901234567890",
        "Trading Wallet"
      );

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(accountService.addWalletToBundle).toHaveBeenCalledWith(
        "user123",
        "0x1234567890123456789012345678901234567890",
        "Trading Wallet"
      );
    });

    it("should handle duplicate wallet error", async () => {
      const duplicateError = new Error("Wallet already associated");
      vi.mocked(accountService.addWalletToBundle).mockRejectedValue(
        duplicateError
      );

      const result = await walletService.addWallet(
        "user123",
        "0x1234567890123456789012345678901234567890",
        "My Wallet"
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Wallet already associated");
    });

    it("should handle invalid wallet address error", async () => {
      const invalidAddressError = new Error("Invalid wallet address");
      vi.mocked(accountService.addWalletToBundle).mockRejectedValue(
        invalidAddressError
      );

      const result = await walletService.addWallet(
        "user123",
        "invalid-address",
        "Test Wallet"
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid wallet address");
    });

    it("should handle network errors", async () => {
      vi.mocked(accountService.addWalletToBundle).mockRejectedValue(
        new Error("Network error")
      );

      const result = await walletService.addWallet(
        "user123",
        "0x1234567890123456789012345678901234567890",
        "Wallet"
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");
    });

    it("should handle unknown errors gracefully", async () => {
      vi.mocked(accountService.addWalletToBundle).mockRejectedValue(
        "String error"
      );

      const result = await walletService.addWallet(
        "user123",
        "0x1234567890123456789012345678901234567890",
        "Wallet"
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unknown error occurred");
    });
  });

  describe("removeWallet", () => {
    it("should remove wallet successfully", async () => {
      vi.mocked(accountService.removeWalletFromBundle).mockResolvedValue({
        message: "Wallet removed successfully",
      });

      const result = await walletService.removeWallet("user123", "wallet456");

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(accountService.removeWalletFromBundle).toHaveBeenCalledWith(
        "user123",
        "wallet456"
      );
    });

    it("should handle wallet not found error", async () => {
      const notFoundError = new Error("Wallet not found");
      vi.mocked(accountService.removeWalletFromBundle).mockRejectedValue(
        notFoundError
      );

      const result = await walletService.removeWallet("user123", "nonexistent");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Wallet not found");
    });

    it("should handle permission errors", async () => {
      const permissionError = new Error("Unauthorized to remove wallet");
      vi.mocked(accountService.removeWalletFromBundle).mockRejectedValue(
        permissionError
      );

      const result = await walletService.removeWallet("user123", "wallet789");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unauthorized to remove wallet");
    });

    it("should handle API errors gracefully", async () => {
      vi.mocked(accountService.removeWalletFromBundle).mockRejectedValue(
        new Error("Server error")
      );

      const result = await walletService.removeWallet("user123", "wallet456");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Server error");
    });
  });

  describe("updateManagedWalletLabel", () => {
    it("should update wallet label successfully", async () => {
      vi.mocked(accountService.updateWalletLabel).mockResolvedValue({
        message: "Label updated successfully",
      });

      const result = await walletService.updateManagedWalletLabel(
        "user123",
        "0x1234567890123456789012345678901234567890",
        "Updated Label"
      );

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(accountService.updateWalletLabel).toHaveBeenCalledWith(
        "user123",
        "0x1234567890123456789012345678901234567890",
        "Updated Label"
      );
    });

    it("should handle empty label update", async () => {
      vi.mocked(accountService.updateWalletLabel).mockResolvedValue({
        message: "Label updated successfully",
      });

      const result = await walletService.updateManagedWalletLabel(
        "user123",
        "0x1234567890123456789012345678901234567890",
        ""
      );

      expect(result.success).toBe(true);
      expect(accountService.updateWalletLabel).toHaveBeenCalledWith(
        "user123",
        "0x1234567890123456789012345678901234567890",
        ""
      );
    });

    it("should handle wallet not found error", async () => {
      const notFoundError = new Error("Wallet not found");
      vi.mocked(accountService.updateWalletLabel).mockRejectedValue(
        notFoundError
      );

      const result = await walletService.updateManagedWalletLabel(
        "user123",
        "0xnonexistent",
        "New Label"
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Wallet not found");
    });

    it("should handle validation errors", async () => {
      const validationError = new Error(
        "Label must be at least 2 characters long"
      );
      vi.mocked(accountService.updateWalletLabel).mockRejectedValue(
        validationError
      );

      const result = await walletService.updateManagedWalletLabel(
        "user123",
        "0x1234567890123456789012345678901234567890",
        "a"
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Label must be at least 2 characters long");
    });
  });

  describe("updateUserEmailSubscription", () => {
    it("should update email subscription successfully", async () => {
      vi.mocked(accountService.updateUserEmail).mockResolvedValue({
        success: true,
        message: "Email updated successfully",
      });

      await expect(
        walletService.updateUserEmailSubscription("user123", "test@example.com")
      ).resolves.toBeUndefined();

      expect(accountService.updateUserEmail).toHaveBeenCalledWith(
        "user123",
        "test@example.com"
      );
    });

    it("should handle duplicate email error", async () => {
      const duplicateError = new Error("Email already in use");
      vi.mocked(accountService.updateUserEmail).mockRejectedValue(
        duplicateError
      );

      await expect(
        walletService.updateUserEmailSubscription(
          "user123",
          "existing@example.com"
        )
      ).rejects.toThrow("Email already in use");
    });

    it("should handle invalid email format error", async () => {
      const invalidEmailError = new Error("Invalid email format");
      vi.mocked(accountService.updateUserEmail).mockRejectedValue(
        invalidEmailError
      );

      await expect(
        walletService.updateUserEmailSubscription("user123", "invalid-email")
      ).rejects.toThrow("Invalid email format");
    });

    it("should handle network errors", async () => {
      vi.mocked(accountService.updateUserEmail).mockRejectedValue(
        new Error("Network error")
      );

      await expect(
        walletService.updateUserEmailSubscription("user123", "test@example.com")
      ).rejects.toThrow("Network error");
    });
  });

  describe("unsubscribeUserEmail", () => {
    it("should unsubscribe user email successfully", async () => {
      vi.mocked(accountService.removeUserEmail).mockResolvedValue({
        success: true,
        message: "Email removed successfully",
      });

      await expect(
        walletService.unsubscribeUserEmail("user123")
      ).resolves.toBeUndefined();

      expect(accountService.removeUserEmail).toHaveBeenCalledWith("user123");
    });

    it("should handle user not found error", async () => {
      const notFoundError = new Error("User not found");
      vi.mocked(accountService.removeUserEmail).mockRejectedValue(
        notFoundError
      );

      await expect(
        walletService.unsubscribeUserEmail("nonexistent")
      ).rejects.toThrow("User not found");
    });

    it("should handle API errors", async () => {
      vi.mocked(accountService.removeUserEmail).mockRejectedValue(
        new Error("Server error")
      );

      await expect(
        walletService.unsubscribeUserEmail("user123")
      ).rejects.toThrow("Server error");
    });

    it("should handle already unsubscribed scenario", async () => {
      const alreadyRemovedError = new Error("No email to remove");
      vi.mocked(accountService.removeUserEmail).mockRejectedValue(
        alreadyRemovedError
      );

      await expect(
        walletService.unsubscribeUserEmail("user123")
      ).rejects.toThrow("No email to remove");
    });
  });

  describe("error handling patterns", () => {
    it("should consistently handle errors across all wrapped functions", async () => {
      const testError = new Error("Test error");

      // Test addWallet error handling
      vi.mocked(accountService.addWalletToBundle).mockRejectedValue(testError);
      const addResult = await walletService.addWallet(
        "user123",
        "0x1234567890123456789012345678901234567890",
        "Test"
      );
      expect(addResult.success).toBe(false);
      expect(addResult.error).toBe("Test error");

      // Test removeWallet error handling
      vi.mocked(accountService.removeWalletFromBundle).mockRejectedValue(
        testError
      );
      const removeResult = await walletService.removeWallet(
        "user123",
        "wallet1"
      );
      expect(removeResult.success).toBe(false);
      expect(removeResult.error).toBe("Test error");

      // Test updateManagedWalletLabel error handling
      vi.mocked(accountService.updateWalletLabel).mockRejectedValue(testError);
      const updateResult = await walletService.updateManagedWalletLabel(
        "user123",
        "0x1234567890123456789012345678901234567890",
        "New Label"
      );
      expect(updateResult.success).toBe(false);
      expect(updateResult.error).toBe("Test error");
    });

    it("should handle non-Error objects thrown from account service", async () => {
      vi.mocked(accountService.addWalletToBundle).mockRejectedValue(
        "Plain string error"
      );

      const result = await walletService.addWallet(
        "user123",
        "0x1234567890123456789012345678901234567890",
        "Test"
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unknown error occurred");
    });
  });
});
