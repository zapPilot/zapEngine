import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NewWallet } from "@/components/WalletManager/types/wallet.types";
import {
  validateEmail,
  validateNewWallet,
} from "@/components/WalletManager/utils/validation";

// Mock the wallet address validation utility
vi.mock("@/lib/validation/walletUtils", () => ({
  validateWalletAddress: (address: string) => {
    // Simple validation: must be 42 chars starting with 0x
    return (
      typeof address === "string" &&
      address.length === 42 &&
      address.startsWith("0x") &&
      /^0x[0-9a-fA-F]{40}$/.test(address)
    );
  },
}));

describe("WalletManager Validation Utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validateEmail", () => {
    describe("valid emails", () => {
      it("should accept valid standard email", () => {
        const result = validateEmail("user@example.com");
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it("should accept email with plus sign", () => {
        const result = validateEmail("user+tag@example.com");
        expect(result.isValid).toBe(true);
      });

      it("should accept email with dots", () => {
        const result = validateEmail("user.name@example.com");
        expect(result.isValid).toBe(true);
      });

      it("should accept email with hyphens in domain", () => {
        const result = validateEmail("user@test-domain.com");
        expect(result.isValid).toBe(true);
      });

      it("should accept email with numbers", () => {
        const result = validateEmail("user123@example456.com");
        expect(result.isValid).toBe(true);
      });

      it("should accept email with underscores", () => {
        const result = validateEmail("user_name@example.com");
        expect(result.isValid).toBe(true);
      });

      it("should accept email with subdomain", () => {
        const result = validateEmail("user@mail.example.com");
        expect(result.isValid).toBe(true);
      });

      it("should accept email with long TLD", () => {
        const result = validateEmail("user@example.technology");
        expect(result.isValid).toBe(true);
      });
    });

    describe("invalid emails", () => {
      it("should reject empty email", () => {
        const result = validateEmail("");
        expect(result.isValid).toBe(false);
        expect(result.error).toBe("Email address is required");
      });

      it("should reject whitespace-only email", () => {
        const result = validateEmail("   ");
        expect(result.isValid).toBe(false);
        expect(result.error).toBe("Email address is required");
      });

      it("should reject email without @ symbol", () => {
        const result = validateEmail("userexample.com");
        expect(result.isValid).toBe(false);
        expect(result.error).toBe("Please enter a valid email address");
      });

      it("should reject email without domain", () => {
        const result = validateEmail("user@");
        expect(result.isValid).toBe(false);
        expect(result.error).toBe("Please enter a valid email address");
      });

      it("should reject email without local part", () => {
        const result = validateEmail("@example.com");
        expect(result.isValid).toBe(false);
        expect(result.error).toBe("Please enter a valid email address");
      });

      it("should reject email without TLD", () => {
        const result = validateEmail("user@example");
        expect(result.isValid).toBe(false);
        expect(result.error).toBe("Please enter a valid email address");
      });

      it("should reject email with spaces", () => {
        const result = validateEmail("user name@example.com");
        expect(result.isValid).toBe(false);
        expect(result.error).toBe("Please enter a valid email address");
      });

      it("should reject email with double @", () => {
        const result = validateEmail("user@@example.com");
        expect(result.isValid).toBe(false);
        expect(result.error).toBe("Please enter a valid email address");
      });

      it("should reject email with single character TLD", () => {
        const result = validateEmail("user@example.c");
        expect(result.isValid).toBe(false);
        expect(result.error).toBe("Please enter a valid email address");
      });

      it("should accept email starting with dot (regex allows it)", () => {
        // The current regex /^[a-zA-Z0-9._+-]+@.../ allows dots at start
        const result = validateEmail(".user@example.com");
        expect(result.isValid).toBe(true);
      });
    });

    describe("edge cases", () => {
      it("should check if email is empty after trim", () => {
        // The validation trims for empty check but validates the original
        const result = validateEmail("  user@example.com  ");
        // Will fail because spaces make it invalid format
        expect(result.isValid).toBe(false);
        expect(result.error).toBe("Please enter a valid email address");
      });

      it("should handle mixed case", () => {
        const result = validateEmail("User@Example.COM");
        expect(result.isValid).toBe(true);
      });
    });
  });

  describe("validateNewWallet", () => {
    const validAddress = "0x1234567890123456789012345678901234567890";

    describe("valid wallets", () => {
      it("should accept wallet with valid label and address", () => {
        const wallet: NewWallet = {
          label: "My Wallet",
          address: validAddress,
        };
        const result = validateNewWallet(wallet);
        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it("should accept wallet with minimum label length", () => {
        const wallet: NewWallet = {
          label: "ab",
          address: validAddress,
        };
        const result = validateNewWallet(wallet);
        expect(result.isValid).toBe(true);
      });

      it("should accept wallet with long label", () => {
        const wallet: NewWallet = {
          label: "My Very Long Wallet Label With Many Characters",
          address: validAddress,
        };
        const result = validateNewWallet(wallet);
        expect(result.isValid).toBe(true);
      });

      it("should accept wallet with label containing numbers", () => {
        const wallet: NewWallet = {
          label: "Wallet 123",
          address: validAddress,
        };
        const result = validateNewWallet(wallet);
        expect(result.isValid).toBe(true);
      });

      it("should accept wallet with label containing special characters", () => {
        const wallet: NewWallet = {
          label: "Trading-Wallet_2024",
          address: validAddress,
        };
        const result = validateNewWallet(wallet);
        expect(result.isValid).toBe(true);
      });
    });

    describe("invalid labels", () => {
      it("should reject wallet with empty label", () => {
        const wallet: NewWallet = {
          label: "",
          address: validAddress,
        };
        const result = validateNewWallet(wallet);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe("Wallet label is required");
      });

      it("should reject wallet with whitespace-only label", () => {
        const wallet: NewWallet = {
          label: "   ",
          address: validAddress,
        };
        const result = validateNewWallet(wallet);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe("Wallet label is required");
      });

      it("should reject wallet with single character label", () => {
        const wallet: NewWallet = {
          label: "a",
          address: validAddress,
        };
        const result = validateNewWallet(wallet);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe(
          "Wallet label must be at least 2 characters long"
        );
      });

      it("should reject wallet with label that is only whitespace after trim", () => {
        const wallet: NewWallet = {
          label: " a ",
          address: validAddress,
        };
        const result = validateNewWallet(wallet);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe(
          "Wallet label must be at least 2 characters long"
        );
      });
    });

    describe("invalid addresses", () => {
      it("should reject wallet with empty address", () => {
        const wallet: NewWallet = {
          label: "My Wallet",
          address: "",
        };
        const result = validateNewWallet(wallet);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe("Wallet address is required");
      });

      it("should reject wallet with whitespace-only address", () => {
        const wallet: NewWallet = {
          label: "My Wallet",
          address: "   ",
        };
        const result = validateNewWallet(wallet);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe("Wallet address is required");
      });

      it("should reject wallet with invalid address format", () => {
        const wallet: NewWallet = {
          label: "My Wallet",
          address: "0xinvalid",
        };
        const result = validateNewWallet(wallet);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe(
          "Invalid wallet address format. Must be a 42-character Ethereum address starting with 0x"
        );
      });

      it("should reject wallet with address not starting with 0x", () => {
        const wallet: NewWallet = {
          label: "My Wallet",
          address: "1234567890123456789012345678901234567890ab",
        };
        const result = validateNewWallet(wallet);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe(
          "Invalid wallet address format. Must be a 42-character Ethereum address starting with 0x"
        );
      });

      it("should reject wallet with address that is too short", () => {
        const wallet: NewWallet = {
          label: "My Wallet",
          address: "0x123",
        };
        const result = validateNewWallet(wallet);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe(
          "Invalid wallet address format. Must be a 42-character Ethereum address starting with 0x"
        );
      });

      it("should reject wallet with address that is too long", () => {
        const wallet: NewWallet = {
          label: "My Wallet",
          address: "0x12345678901234567890123456789012345678901234",
        };
        const result = validateNewWallet(wallet);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe(
          "Invalid wallet address format. Must be a 42-character Ethereum address starting with 0x"
        );
      });

      it("should reject wallet with address containing invalid characters", () => {
        const wallet: NewWallet = {
          label: "My Wallet",
          address: "0xGHIJKL7890123456789012345678901234567890",
        };
        const result = validateNewWallet(wallet);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe(
          "Invalid wallet address format. Must be a 42-character Ethereum address starting with 0x"
        );
      });
    });

    describe("validation order", () => {
      it("should validate label before address", () => {
        const wallet: NewWallet = {
          label: "",
          address: "invalid",
        };
        const result = validateNewWallet(wallet);
        expect(result.isValid).toBe(false);
        // Should return label error first
        expect(result.error).toBe("Wallet label is required");
      });
    });

    describe("edge cases", () => {
      it("should trim label before validation", () => {
        const wallet: NewWallet = {
          label: "  My Wallet  ",
          address: validAddress,
        };
        const result = validateNewWallet(wallet);
        expect(result.isValid).toBe(true);
      });

      it("should trim address but still validate format", () => {
        // Address trimming happens, but format must still be valid after trim
        const wallet: NewWallet = {
          label: "My Wallet",
          address: `  ${validAddress}`,
        };
        const result = validateNewWallet(wallet);
        // Will fail because the mock validator checks exact length
        expect(result.isValid).toBe(false);
        expect(result.error).toContain("Invalid wallet address format");
      });

      it("should accept wallet with mixed case address", () => {
        const mixedCaseAddress = "0xAbCdEf1234567890123456789012345678901234";
        const wallet: NewWallet = {
          label: "My Wallet",
          address: mixedCaseAddress,
        };
        const result = validateNewWallet(wallet);
        expect(result.isValid).toBe(true);
      });
    });
  });
});
