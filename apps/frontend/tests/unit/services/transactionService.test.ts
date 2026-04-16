import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  computeProjectedAllocation,
  getSupportedTokens,
  getTokenBalance,
  simulateDeposit,
  simulateRebalance,
  simulateWithdraw,
} from "@/services/transactionService.mock";

describe("transactionService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getSupportedTokens", () => {
    it("should return tokens for Ethereum (chainId 1)", async () => {
      const promise = getSupportedTokens(1);
      await vi.advanceTimersByTimeAsync(150);
      const result = await promise;

      expect(result.length).toBeGreaterThan(0);
      expect(result.every(t => t.chainId === 1)).toBe(true);
    });

    it("should return tokens for Polygon (chainId 137)", async () => {
      const promise = getSupportedTokens(137);
      await vi.advanceTimersByTimeAsync(150);
      const result = await promise;

      expect(result.some(t => t.symbol === "MATIC")).toBe(true);
    });

    it("should include USDC for Ethereum", async () => {
      const promise = getSupportedTokens(1);
      await vi.advanceTimersByTimeAsync(150);
      const result = await promise;

      const usdc = result.find(t => t.symbol === "USDC");
      expect(usdc).toBeDefined();
      expect(usdc?.decimals).toBe(6);
      expect(usdc?.category).toBe("stable");
    });

    it("should return empty array for unsupported chainId", async () => {
      const promise = getSupportedTokens(999);
      await vi.advanceTimersByTimeAsync(150);
      const result = await promise;

      expect(result).toEqual([]);
    });
  });

  describe("getTokenBalance", () => {
    it("should return balance for known token", async () => {
      const promise = getTokenBalance(1, "0xusdc");
      await vi.advanceTimersByTimeAsync(200);
      const result = await promise;

      expect(result).toEqual({ balance: "1000.50", usdValue: 1000.5 });
    });

    it("should return zero balance for unknown token", async () => {
      const promise = getTokenBalance(1, "0xunknown");
      await vi.advanceTimersByTimeAsync(200);
      const result = await promise;

      expect(result).toEqual({ balance: "0", usdValue: 0 });
    });
  });

  describe("simulateDeposit", () => {
    it("should return successful deposit result", async () => {
      const promise = simulateDeposit({
        amount: "100",
        tokenAddress: "0xusdc",
        chainId: 1,
      });
      await vi.advanceTimersByTimeAsync(1200);
      const result = await promise;

      expect(result.type).toBe("deposit");
      expect(result.status).toBe("success");
      expect(result.amount).toBe("100");
      expect(result.txHash).toMatch(/^0x[a-f0-9]+$/);
      expect(result.timestamp).toBeDefined();
    });
  });

  describe("simulateWithdraw", () => {
    it("should return successful withdraw result", async () => {
      const promise = simulateWithdraw({
        amount: "50",
        tokenAddress: "0xeth",
        chainId: 1,
      });
      await vi.advanceTimersByTimeAsync(1200);
      const result = await promise;

      expect(result.type).toBe("withdraw");
      expect(result.status).toBe("success");
      expect(result.message).toBe("Withdraw simulated successfully");
    });
  });

  describe("simulateRebalance", () => {
    it("should return successful rebalance result", async () => {
      const currentAllocation = {
        crypto: 60,
        stable: 40,
        simplifiedCrypto: 60,
      };
      const targetAllocation = { crypto: 40, stable: 60, simplifiedCrypto: 40 };

      const promise = simulateRebalance(
        50,
        currentAllocation,
        targetAllocation
      );
      await vi.advanceTimersByTimeAsync(1000);
      const result = await promise;

      expect(result.type).toBe("rebalance");
      expect(result.status).toBe("success");
      expect(result.message).toContain("Rebalanced 50%");
    });
  });

  describe("computeProjectedAllocation", () => {
    const currentAllocation = { crypto: 60, stable: 40, simplifiedCrypto: 60 };
    const targetAllocation = { crypto: 40, stable: 60, simplifiedCrypto: 40 };

    it("should compute allocation at 0% intensity", () => {
      const result = computeProjectedAllocation(
        0,
        currentAllocation,
        targetAllocation
      );

      expect(result.crypto).toBe(60);
      expect(result.stable).toBe(40);
    });

    it("should compute allocation at 100% intensity", () => {
      const result = computeProjectedAllocation(
        100,
        currentAllocation,
        targetAllocation
      );

      expect(result.crypto).toBe(40);
      expect(result.stable).toBe(60);
    });

    it("should compute allocation at 50% intensity", () => {
      const result = computeProjectedAllocation(
        50,
        currentAllocation,
        targetAllocation
      );

      expect(result.crypto).toBe(50);
      expect(result.stable).toBe(50);
    });

    it("should clamp values between 0 and 100", () => {
      const extremeCurrent = { crypto: 5, stable: 95, simplifiedCrypto: 5 };
      const extremeTarget = { crypto: 0, stable: 100, simplifiedCrypto: 0 };

      const result = computeProjectedAllocation(
        200,
        extremeCurrent,
        extremeTarget
      );

      expect(result.crypto).toBeGreaterThanOrEqual(0);
      expect(result.crypto).toBeLessThanOrEqual(100);
      expect(result.stable).toBeGreaterThanOrEqual(0);
      expect(result.stable).toBeLessThanOrEqual(100);
    });

    it("should preserve simplifiedCrypto from current allocation", () => {
      const result = computeProjectedAllocation(
        50,
        currentAllocation,
        targetAllocation
      );

      expect(result.simplifiedCrypto).toBe(currentAllocation.simplifiedCrypto);
    });
  });
});
