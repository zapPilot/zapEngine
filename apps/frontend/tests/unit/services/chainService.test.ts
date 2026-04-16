import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getChainById, getSupportedChains } from "@/services/chainService.mock";

describe("chainService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getSupportedChains", () => {
    it("should return all supported chains", async () => {
      const promise = getSupportedChains();

      // Fast-forward past the delay
      await vi.advanceTimersByTimeAsync(150);

      const result = await promise;

      expect(result).toHaveLength(3);
      expect(result.map(c => c.name)).toEqual([
        "Ethereum",
        "Polygon",
        "Arbitrum",
      ]);
    });

    it("should include Ethereum chain data", async () => {
      const promise = getSupportedChains();
      await vi.advanceTimersByTimeAsync(150);
      const result = await promise;

      const ethereum = result.find(c => c.chainId === 1);
      expect(ethereum).toEqual({
        chainId: 1,
        name: "Ethereum",
        symbol: "ETH",
        iconUrl: "/chains/eth.svg",
        isActive: true,
      });
    });

    it("should include active and inactive chains", async () => {
      const promise = getSupportedChains();
      await vi.advanceTimersByTimeAsync(150);
      const result = await promise;

      const activeChains = result.filter(c => c.isActive);
      const inactiveChains = result.filter(c => !c.isActive);

      expect(activeChains).toHaveLength(2);
      expect(inactiveChains).toHaveLength(1);
    });
  });

  describe("getChainById", () => {
    it("should return Ethereum chain for chainId 1", async () => {
      const promise = getChainById(1);
      await vi.advanceTimersByTimeAsync(150);
      const result = await promise;

      expect(result).toEqual({
        chainId: 1,
        name: "Ethereum",
        symbol: "ETH",
        iconUrl: "/chains/eth.svg",
        isActive: true,
      });
    });

    it("should return Polygon chain for chainId 137", async () => {
      const promise = getChainById(137);
      await vi.advanceTimersByTimeAsync(150);
      const result = await promise;

      expect(result?.name).toBe("Polygon");
      expect(result?.symbol).toBe("MATIC");
    });

    it("should return Arbitrum chain for chainId 42161", async () => {
      const promise = getChainById(42161);
      await vi.advanceTimersByTimeAsync(150);
      const result = await promise;

      expect(result?.name).toBe("Arbitrum");
      expect(result?.isActive).toBe(false);
    });

    it("should return undefined for unknown chainId", async () => {
      const promise = getChainById(999999);
      await vi.advanceTimersByTimeAsync(150);
      const result = await promise;

      expect(result).toBeUndefined();
    });
  });
});
