/**
 * walletUtils Tests
 *
 * Tests for wallet validation and transformation utilities
 */

import { describe, expect, it, vi } from "vitest";

import {
  handleWalletError,
  transformWalletData,
  validateWalletAddress,
} from "@/lib/validation/walletUtils";

// Mock dependencies
vi.mock("@/lib/http", () => ({
  APIError: class APIError extends Error {
    name = "APIError";
  },
  handleHTTPError: vi.fn().mockReturnValue("Generic HTTP error"),
}));

describe("validateWalletAddress", () => {
  describe("valid addresses", () => {
    it("accepts valid Ethereum address (lowercase)", () => {
      expect(
        validateWalletAddress("0x742d35cc6634c0532925a3b844bc9e7595f8d1e9")
      ).toBe(true);
    });

    it("accepts valid Ethereum address (uppercase)", () => {
      expect(
        validateWalletAddress("0x742D35CC6634C0532925A3B844BC9E7595F8D1E9")
      ).toBe(true);
    });

    it("accepts valid Ethereum address (mixed case - checksum)", () => {
      expect(
        validateWalletAddress("0x742D35Cc6634C0532925a3b844Bc9e7595f8D1E9")
      ).toBe(true);
    });
  });

  describe("invalid addresses", () => {
    it("rejects address without 0x prefix", () => {
      expect(
        validateWalletAddress("742d35cc6634c0532925a3b844bc9e7595f8d1e9")
      ).toBe(false);
    });

    it("rejects address that is too short", () => {
      expect(validateWalletAddress("0x742d35cc6634c0532925a3b844bc9e75")).toBe(
        false
      );
    });

    it("rejects address that is too long", () => {
      expect(
        validateWalletAddress("0x742d35cc6634c0532925a3b844bc9e7595f8d1e9aa")
      ).toBe(false);
    });

    it("rejects address with invalid characters", () => {
      expect(
        validateWalletAddress("0x742g35cc6634c0532925a3b844bc9e7595f8d1e9")
      ).toBe(false);
    });

    it("rejects empty string", () => {
      expect(validateWalletAddress("")).toBe(false);
    });

    it("rejects random string", () => {
      expect(validateWalletAddress("not-a-wallet-address")).toBe(false);
    });
  });
});

describe("transformWalletData", () => {
  it("transforms single wallet correctly", () => {
    const wallets = [
      {
        id: "wallet-1",
        wallet: "0x742d35cc6634c0532925a3b844bc9e7595f8d1e9",
        label: "Main Wallet",
        created_at: "2024-01-01T00:00:00Z",
      },
    ];

    const result = transformWalletData(wallets);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "wallet-1",
      address: "0x742d35cc6634c0532925a3b844bc9e7595f8d1e9",
      label: "Main Wallet",
      isMain: false,
      isActive: false,
      createdAt: "2024-01-01T00:00:00Z",
    });
  });

  it("provides default label when not specified", () => {
    const wallets = [
      {
        id: "wallet-1",
        wallet: "0x742d35cc6634c0532925a3b844bc9e7595f8d1e9",
        label: null,
        created_at: "2024-01-01T00:00:00Z",
      },
    ];

    const result = transformWalletData(wallets);

    expect(result[0].label).toBe("Wallet");
  });

  it("transforms multiple wallets", () => {
    const wallets = [
      {
        id: "wallet-1",
        wallet: "0x111",
        label: "First",
        created_at: "2024-01-01T00:00:00Z",
      },
      {
        id: "wallet-2",
        wallet: "0x222",
        label: "Second",
        created_at: "2024-01-02T00:00:00Z",
      },
    ];

    const result = transformWalletData(wallets);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("wallet-1");
    expect(result[1].id).toBe("wallet-2");
  });

  it("returns empty array for empty input", () => {
    expect(transformWalletData([])).toEqual([]);
  });
});

describe("handleWalletError", () => {
  it("returns message for APIError", () => {
    const error = new Error("API failure");
    error.name = "APIError";

    expect(handleWalletError(error)).toBe("API failure");
  });

  it("returns message for AccountServiceError", () => {
    const error = new Error("Account service failure");
    error.name = "AccountServiceError";

    expect(handleWalletError(error)).toBe("Account service failure");
  });

  it("returns generic error for unknown errors", () => {
    const error = { foo: "bar" };

    expect(handleWalletError(error)).toBe("Generic HTTP error");
  });
});
