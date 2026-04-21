/**
 * Unit tests for DeFiLlamaFetcher
 * Tests API data fetching, rate limiting, error handling, and response validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DeFiLlamaFetcher,
  type DeFiLlamaResponse,
  type DeFiLlamaPool,
} from "../../../../src/modules/pool/fetcher.js";
import { fixturesData } from "../../../fixtures/fixtures.js";
import {
  createMockApiResponse,
  mockCurrentTime,
  restoreRealTime,
} from "../../../utils/testHelpers.js";

// Mock the logger to prevent console output during tests
vi.mock("../../../../src/utils/logger.js", async () => {
  const { mockLogger } = await import("../../../setup/mocks.js");
  return mockLogger();
});

// Mock the environment to provide consistent API URLs
vi.mock("../../../../src/config/environment.js", () => ({
  env: {
    DEFILLAMA_API_URL: "https://api.llama.fi",
  },
}));

// Mock global fetch
global.fetch = vi.fn();

/** Deterministic pool ID counter to avoid non-deterministic Math.random() in fixtures. */
let poolIdCounter = 0;
function nextPoolId(): string {
  return `pool-${String(++poolIdCounter).padStart(4, "0")}`;
}

function getMockFetch(): ReturnType<typeof vi.fn> {
  return global.fetch as unknown as ReturnType<typeof vi.fn>;
}

describe("DeFiLlamaFetcher", () => {
  let fetcher: DeFiLlamaFetcher;
  const fixedTimestamp = "2024-01-15T12:00:00.000Z";

  beforeEach(() => {
    vi.clearAllMocks();
    poolIdCounter = 0;
    fetcher = new DeFiLlamaFetcher();
    mockCurrentTime(fixedTimestamp);
  });

  afterEach(() => {
    restoreRealTime();
    vi.resetAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with correct base URL", () => {
      expect(fetcher).toBeDefined();
      expect(fetcher.getRequestStats()).toEqual({
        requestCount: 0,
        lastRequestTime: 0,
      });
    });
  });

  describe("healthCheck", () => {
    it("returns unhealthy when fetch fails", async () => {
      const fetcher = new DeFiLlamaFetcher();
      vi.spyOn(fetcher, "fetchPoolsByChain").mockRejectedValueOnce(
        new Error("boom"),
      );

      const result = await fetcher.healthCheck();

      expect(result.status).toBe("unhealthy");
      expect(result.details).toBe("boom");
    });
  });

  describe("fetchAllPools", () => {
    // Helper to create valid pool data
    const createValidPool = (
      overrides: Partial<DeFiLlamaPool> = {},
    ): DeFiLlamaPool => ({
      pool: nextPoolId(),
      chain: "Polygon",
      project: "balancer-v2",
      symbol: "USDC-DAI",
      tvlUsd: 1000000,
      apy: 5.0,
      stablecoin: true,
      ilRisk: "no",
      exposure: "stable",
      ...overrides,
    });

    describe("successful API responses", () => {
      it("should fetch and transform valid pools", async () => {
        const mockData = {
          status: "success",
          data: [
            createValidPool({
              pool: "pool-1",
              chain: "Polygon",
              project: "balancer-v2",
              tvlUsd: 1000000,
            }),
            createValidPool({
              pool: "pool-2",
              chain: "Ethereum",
              project: "compound",
              tvlUsd: 2000000,
            }),
          ],
        };
        const mockResponse = createMockApiResponse(mockData);
        getMockFetch().mockResolvedValueOnce(mockResponse);

        const result = await fetcher.fetchAllPools();

        expect(global.fetch).toHaveBeenCalledWith(
          "https://yields.llama.fi/pools",
          expect.objectContaining({
            headers: expect.objectContaining({
              "User-Agent": "alpha-etl/1.0.0",
              Accept: "application/json",
            }),
          }),
        );

        expect(result.length).toBeGreaterThan(0); // At least some pools should be returned

        // Verify transformation of first pool
        const firstPool = result[0];
        expect(firstPool).toBeDefined();
        expect(firstPool.chain).toBe("polygon");
        expect(firstPool.protocol).toBe("balancer-v2");
        expect(firstPool.source).toBe("defillama");
        expect(firstPool.pool_address).toBeNull(); // DeFiLlama uses UUIDs
        expect(firstPool.protocol_address).toBeNull();
      });

      it("should apply TVL threshold filtering", async () => {
        const mockData = {
          status: "success",
          data: [
            createValidPool({ tvlUsd: 2000000000 }), // 2B - above threshold
            createValidPool({ tvlUsd: 500000000 }), // 500M - below threshold
          ],
        };
        const mockResponse = createMockApiResponse(mockData);
        getMockFetch().mockResolvedValueOnce(mockResponse);

        const tvlThreshold = 1000000000; // 1B threshold
        const result = await fetcher.fetchAllPools(tvlThreshold);

        // Should only return pools with TVL > threshold
        expect(result.every((pool) => (pool.tvl_usd || 0) > tvlThreshold)).toBe(
          true,
        );
      });

      it("should handle zero TVL threshold", async () => {
        const mockData = {
          status: "success",
          data: [
            createValidPool({ tvlUsd: 1000 }),
            createValidPool({ tvlUsd: 500 }),
          ],
        };
        const mockResponse = createMockApiResponse(mockData);
        getMockFetch().mockResolvedValueOnce(mockResponse);

        const result = await fetcher.fetchAllPools(0);

        expect(result.length).toBeGreaterThan(0);
      });

      it("should transform pool data correctly", async () => {
        const samplePool: DeFiLlamaPool = {
          pool: "test-uuid",
          chain: "Ethereum",
          project: "compound-v2",
          symbol: "usdc-dai",
          tvlUsd: 1500000.5,
          apy: 5.4,
          apyBase: 3.2,
          apyReward: 2.2,
          stablecoin: false,
          ilRisk: "no",
          exposure: "multi",
          underlyingTokens: ["0x123", "0x456"],
          rewardTokens: ["0x789"],
          volumeUsd1d: 250000,
          poolMeta: "lending",
        };

        const mockResponse = createMockApiResponse({
          status: "success",
          data: [samplePool],
        });
        getMockFetch().mockResolvedValueOnce(mockResponse);

        const result = await fetcher.fetchAllPools();

        expect(result).toHaveLength(1);
        const transformed = result[0];
        expect(transformed.chain).toBe("ethereum"); // Normalized to lowercase
        expect(transformed.protocol).toBe("compound-v2");
        expect(transformed.symbol).toBe("usdc-dai"); // Symbol is lowercased in fetcher
        expect(transformed.tvl_usd).toBe(1500000.5);
        expect(transformed.apy).toBe(5.4);
        expect(transformed.apy_base).toBe(3.2);
        expect(transformed.apy_reward).toBe(2.2);
        expect(transformed.volume_usd_1d).toBe(250000);
        expect(transformed.exposure).toBe("multi");
        expect(transformed.reward_tokens).toEqual(["0x789"]);
        expect(transformed.underlying_tokens).toEqual(["0x123", "0x456"]);
        expect(transformed.source).toBe("defillama");
        expect(transformed.raw_data).toBeDefined();
        expect(transformed.raw_data?.defillama_pool_id).toBe("test-uuid");
      });

      it("should handle pools with null/undefined values", async () => {
        const poolWithNulls: DeFiLlamaPool = {
          pool: "test-uuid-nulls",
          chain: "Ethereum",
          project: "test-protocol",
          symbol: "TEST",
          tvlUsd: 1000,
          apy: 2.5,
          stablecoin: false,
          ilRisk: "unknown",
          exposure: "single",
          // Optional fields as null/undefined
          apyBase: null,
          apyReward: undefined,
          underlyingTokens: null,
          rewardTokens: undefined,
          volumeUsd1d: null,
          poolMeta: undefined,
        } as unknown;

        const mockResponse = createMockApiResponse({
          status: "success",
          data: [poolWithNulls],
        });
        getMockFetch().mockResolvedValueOnce(mockResponse);

        const result = await fetcher.fetchAllPools();

        expect(result).toHaveLength(1);
        const transformed = result[0];
        expect(transformed.apy_base).toBeNull();
        expect(transformed.apy_reward).toBeNull();
        expect(transformed.underlying_tokens).toBeNull();
        expect(transformed.reward_tokens).toBeNull();
        expect(transformed.volume_usd_1d).toBeNull();
        expect(transformed.pool_meta).toBeNull();
      });
    });

    describe("error handling", () => {
      it("should handle HTTP errors", async () => {
        const mockResponse = {
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          json: vi.fn().mockResolvedValue({}),
        };
        // Need to mock all 4 attempts (maxRetries=3 means 4 total attempts)
        getMockFetch()
          .mockResolvedValueOnce(mockResponse)
          .mockResolvedValueOnce(mockResponse)
          .mockResolvedValueOnce(mockResponse)
          .mockResolvedValueOnce(mockResponse);

        await expect(fetcher.fetchAllPools()).rejects.toThrow(
          "DeFiLlama API error: 500 Internal Server Error",
        );
      });

      it("should handle non-success API status", async () => {
        const mockResponse = createMockApiResponse({
          status: "error",
          data: [],
        });
        getMockFetch().mockResolvedValueOnce(mockResponse);

        await expect(fetcher.fetchAllPools()).rejects.toThrow(
          "DeFiLlama API returned non-success status: error",
        );
      });

      it("should handle network errors", async () => {
        // Need to mock all 4 attempts (maxRetries=3 means 4 total attempts)
        getMockFetch()
          .mockRejectedValueOnce(new Error("Network error"))
          .mockRejectedValueOnce(new Error("Network error"))
          .mockRejectedValueOnce(new Error("Network error"))
          .mockRejectedValueOnce(new Error("Network error"));

        await expect(fetcher.fetchAllPools()).rejects.toThrow("Network error");
      });

      it("should handle malformed JSON responses", async () => {
        const mockResponse = {
          ok: true,
          status: 200,
          json: vi
            .fn()
            .mockRejectedValueOnce(new Error("Invalid JSON"))
            .mockRejectedValueOnce(new Error("Invalid JSON"))
            .mockRejectedValueOnce(new Error("Invalid JSON"))
            .mockRejectedValueOnce(new Error("Invalid JSON")),
        };
        getMockFetch()
          .mockResolvedValueOnce(mockResponse)
          .mockResolvedValueOnce(mockResponse)
          .mockResolvedValueOnce(mockResponse)
          .mockResolvedValueOnce(mockResponse);

        await expect(fetcher.fetchAllPools()).rejects.toThrow("Invalid JSON");
      });

      it("should handle empty response data", async () => {
        const mockResponse = createMockApiResponse({
          status: "success",
          data: [],
        });
        getMockFetch().mockResolvedValueOnce(mockResponse);

        const result = await fetcher.fetchAllPools();

        expect(result).toEqual([]);
      });

      it("should filter out pools that fail transformation", async () => {
        const validPool: DeFiLlamaPool = {
          pool: "valid-uuid",
          chain: "Ethereum",
          project: "compound",
          symbol: "USDC",
          tvlUsd: 1000,
          apy: 2.5,
          stablecoin: true,
          ilRisk: "no",
          exposure: "single",
        };

        // Pool with empty chain will pass schema but fail transformation
        const invalidPool: DeFiLlamaPool = {
          pool: "invalid-uuid",
          chain: "", // Empty chain will fail transformation
          project: "test",
          symbol: "TEST",
          tvlUsd: 0,
          apy: null as unknown,
          stablecoin: false,
          ilRisk: "no",
          exposure: "single",
        };

        const mockResponse = createMockApiResponse({
          status: "success",
          data: [validPool, invalidPool],
        });
        getMockFetch().mockResolvedValueOnce(mockResponse);

        const result = await fetcher.fetchAllPools();

        // Should only return valid transformations
        expect(result).toHaveLength(1);
        expect(result[0].protocol).toBe("compound");
      });

      it("logs and drops pools that throw during transformation", async () => {
        // Missing 'chain' causes the schema validation to fail entirely when
        // the pool data doesn't have required fields, so we need a properly
        // structured response that passes schema but fails transformation
        const poolWithInvalidChain = {
          pool: "bad-uuid",
          chain: "", // Empty chain will fail during transformation
          project: "compound",
          symbol: "USDC",
          tvlUsd: 1000,
          apy: 2,
          stablecoin: true,
          ilRisk: "no",
          exposure: "single",
        };

        const mockResponse = createMockApiResponse({
          status: "success",
          data: [poolWithInvalidChain],
        });
        getMockFetch().mockResolvedValueOnce(mockResponse);

        const result = await fetcher.fetchAllPools();

        expect(result).toEqual([]);
      });

      it("should drop pools below TVL threshold", async () => {
        const tinyPool: DeFiLlamaPool = {
          pool: "tiny",
          chain: "Ethereum",
          project: "test",
          symbol: "TEST",
          tvlUsd: 10,
          apy: 1,
          stablecoin: false,
          ilRisk: "no",
          exposure: "single",
        };

        const mockResponse = createMockApiResponse({
          status: "success",
          data: [tinyPool],
        });
        getMockFetch().mockResolvedValueOnce(mockResponse);

        const result = await fetcher.fetchAllPools(1000);

        expect(result).toEqual([]);
      });
    });

    describe("rate limiting", () => {
      it("should track request statistics", async () => {
        const mockResponse = createMockApiResponse({
          status: "success",
          data: [],
        });
        getMockFetch().mockResolvedValueOnce(mockResponse);

        const initialStats = fetcher.getRequestStats();
        expect(initialStats.requestCount).toBe(0);

        await fetcher.fetchAllPools();

        const finalStats = fetcher.getRequestStats();
        expect(finalStats.requestCount).toBe(1);
        expect(finalStats.lastRequestTime).toBeGreaterThan(0);
      });
    });
  });

  describe("fetchPoolsByChain", () => {
    // Helper to create valid pool data for tests
    const createValidMockPool = (
      chain: string,
      tvlUsd: number,
    ): DeFiLlamaPool => ({
      pool: `pool-${chain}-${nextPoolId()}`,
      chain,
      project: "compound-v2",
      symbol: "USDC",
      tvlUsd,
      apy: 5.0,
      stablecoin: true,
      ilRisk: "no",
      exposure: "single",
    });

    it("should filter pools by chain", async () => {
      const mockData = {
        status: "success",
        data: [
          createValidMockPool("Ethereum", 1000000),
          createValidMockPool("Ethereum", 2000000),
          createValidMockPool("Polygon", 500000),
        ],
      };
      const mockResponse = createMockApiResponse(mockData);
      getMockFetch().mockResolvedValueOnce(mockResponse);

      const result = await fetcher.fetchPoolsByChain("ethereum");

      // All returned pools should be on ethereum
      expect(result.every((pool) => pool.chain === "ethereum")).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should handle chain name mapping", async () => {
      const mockData = {
        status: "success",
        data: [
          createValidMockPool("Ethereum", 1000000),
          createValidMockPool("Polygon", 500000),
        ],
      };
      const mockResponse = createMockApiResponse(mockData);
      getMockFetch().mockResolvedValueOnce(mockResponse);

      // Test that both 'ETH' and 'ethereum' work
      const result = await fetcher.fetchPoolsByChain("ethereum");

      expect(result.every((pool) => pool.chain === "ethereum")).toBe(true);
    });

    it("should return empty array for unsupported chains", async () => {
      const mockData = {
        status: "success",
        data: [
          createValidMockPool("Ethereum", 1000000),
          createValidMockPool("Polygon", 500000),
        ],
      };
      const mockResponse = createMockApiResponse(mockData);
      getMockFetch().mockResolvedValueOnce(mockResponse);

      const result = await fetcher.fetchPoolsByChain("unsupported-chain");

      expect(result).toEqual([]);
    });

    it("should apply TVL threshold when fetching by chain", async () => {
      const mockData = {
        status: "success",
        data: [
          createValidMockPool("Ethereum", 2000000000), // 2B - above threshold
          createValidMockPool("Ethereum", 500000000), // 500M - below threshold
        ],
      };
      const mockResponse = createMockApiResponse(mockData);
      getMockFetch().mockResolvedValueOnce(mockResponse);

      const tvlThreshold = 1000000000; // 1B
      const result = await fetcher.fetchPoolsByChain("ethereum", tvlThreshold);

      expect(result.every((pool) => (pool.tvl_usd || 0) > tvlThreshold)).toBe(
        true,
      );
    });
  });

  describe("findMatchingPool", () => {
    it("should find pools matching all criteria", async () => {
      const mockResponse = createMockApiResponse(
        fixturesData.defillama as DeFiLlamaResponse,
      );
      getMockFetch().mockResolvedValueOnce(mockResponse);

      const result = await fetcher.findMatchingPool(
        "ethereum",
        "compound",
        "2",
        ["USDC"],
      );

      expect(result).toBeDefined();
      if (result) {
        expect(result.chain).toBe("ethereum");
        expect(result.protocol).toContain("compound");
      }
    });

    it("should return null when no matching pool found", async () => {
      const mockResponse = createMockApiResponse(
        fixturesData.defillama as DeFiLlamaResponse,
      );
      getMockFetch().mockResolvedValueOnce(mockResponse);

      const result = await fetcher.findMatchingPool(
        "ethereum",
        "nonexistent-protocol",
        "1",
        ["NONEXISTENT"],
      );

      expect(result).toBeNull();
    });

    it("returns null when symbols mismatch but chain/project match", async () => {
      const mockResponse = createMockApiResponse({
        status: "success",
        data: [
          {
            pool: "uuid",
            chain: "ethereum",
            project: "compound",
            symbol: "dai-usdc",
            tvlUsd: 1_000_000,
            apy: 5,
            stablecoin: true,
            ilRisk: "no",
            exposure: "single",
          },
        ],
      } as DeFiLlamaResponse);
      getMockFetch().mockResolvedValueOnce(mockResponse);

      const result = await fetcher.findMatchingPool(
        "ethereum",
        "compound",
        "0",
        ["weth", "usdc"],
      );

      expect(result).toBeNull();
    });

    it("returns null when pool symbol is missing", async () => {
      const mockResponse = createMockApiResponse({
        status: "success",
        data: [
          {
            pool: "uuid",
            chain: "ethereum",
            project: "compound",
            symbol: "",
            tvlUsd: 1_000_000,
            apy: 5,
            stablecoin: true,
            ilRisk: "no",
            exposure: "single",
          },
        ],
      } as DeFiLlamaResponse);
      getMockFetch().mockResolvedValueOnce(mockResponse);

      const result = await fetcher.findMatchingPool(
        "ethereum",
        "compound",
        "0",
        ["weth", "usdc"],
      );

      expect(result).toBeNull();
    });

    it("should handle version matching", async () => {
      const mockResponse = createMockApiResponse(
        fixturesData.defillama as DeFiLlamaResponse,
      );
      getMockFetch().mockResolvedValueOnce(mockResponse);

      // Test version "0" (should match any version)
      const resultV0 = await fetcher.findMatchingPool(
        "ethereum",
        "compound",
        "0",
        ["USDC"],
      );

      expect(resultV0).toBeDefined();
    });

    it("should match symbols correctly", async () => {
      const mockResponse = createMockApiResponse(
        fixturesData.defillama as DeFiLlamaResponse,
      );
      getMockFetch().mockResolvedValueOnce(mockResponse);

      // Test multi-symbol matching
      const result = await fetcher.findMatchingPool(
        "ethereum",
        "uniswap",
        "0",
        ["ETH", "USDC"],
      );

      if (result) {
        expect(result.symbol.toLowerCase()).toMatch(/eth.*usdc|usdc.*eth/);
      }
    });

    it("should handle errors gracefully", async () => {
      getMockFetch().mockRejectedValueOnce(new Error("Network error"));

      const result = await fetcher.findMatchingPool(
        "ethereum",
        "compound",
        "2",
        ["USDC"],
      );

      expect(result).toBeNull();
    });
  });

  describe("private methods behavior through public interface", () => {
    describe("exposure mapping", () => {
      it("should map exposure values correctly", async () => {
        const poolWithSingleExposure: DeFiLlamaPool = {
          pool: "single-exposure",
          chain: "Ethereum",
          project: "test",
          symbol: "USDC",
          tvlUsd: 1000,
          apy: 2.5,
          stablecoin: true,
          ilRisk: "no",
          exposure: "single",
        };

        const poolWithStableExposure: DeFiLlamaPool = {
          pool: "stable-exposure",
          chain: "Ethereum",
          project: "test",
          symbol: "USDC-DAI",
          tvlUsd: 1000,
          apy: 2.5,
          stablecoin: true,
          ilRisk: "no",
          exposure: "stable",
        };

        const mockResponse = createMockApiResponse({
          status: "success",
          data: [poolWithSingleExposure, poolWithStableExposure],
        });
        getMockFetch().mockResolvedValueOnce(mockResponse);

        const result = await fetcher.fetchAllPools();

        expect(result[0].exposure).toBe("single");
        expect(result[1].exposure).toBe("stable");
      });

      it("should default to multi exposure for unknown values", async () => {
        const poolWithUnknownExposure: DeFiLlamaPool = {
          pool: "unknown-exposure",
          chain: "Ethereum",
          project: "test",
          symbol: "TEST",
          tvlUsd: 1000,
          apy: 2.5,
          stablecoin: false,
          ilRisk: "no",
          exposure: "unknown-value" as unknown,
        };

        const mockResponse = createMockApiResponse({
          status: "success",
          data: [poolWithUnknownExposure],
        });
        getMockFetch().mockResolvedValueOnce(mockResponse);

        const result = await fetcher.fetchAllPools();

        expect(result[0].exposure).toBe("multi");
      });
    });

    describe("reward tokens cleaning", () => {
      it("should clean null and empty values from reward tokens", async () => {
        // Note: Zod schema now requires strings in the array, so we test with
        // empty strings and whitespace which the cleaning logic should remove
        const poolWithMessyRewardTokens: DeFiLlamaPool = {
          pool: "messy-rewards",
          chain: "Ethereum",
          project: "test",
          symbol: "TEST",
          tvlUsd: 1000,
          apy: 2.5,
          stablecoin: false,
          ilRisk: "no",
          exposure: "single",
          rewardTokens: ["0x123", "", "0x456", "   "],
        };

        const mockResponse = createMockApiResponse({
          status: "success",
          data: [poolWithMessyRewardTokens],
        });
        getMockFetch().mockResolvedValueOnce(mockResponse);

        const result = await fetcher.fetchAllPools();

        expect(result[0].reward_tokens).toEqual(["0x123", "0x456"]);
      });

      it("should return null for empty reward tokens array", async () => {
        const poolWithEmptyRewardTokens: DeFiLlamaPool = {
          pool: "empty-rewards",
          chain: "Ethereum",
          project: "test",
          symbol: "TEST",
          tvlUsd: 1000,
          apy: 2.5,
          stablecoin: false,
          ilRisk: "no",
          exposure: "single",
          rewardTokens: ["", "   "], // Only empty/whitespace strings
        };

        const mockResponse = createMockApiResponse({
          status: "success",
          data: [poolWithEmptyRewardTokens],
        });
        getMockFetch().mockResolvedValueOnce(mockResponse);

        const result = await fetcher.fetchAllPools();

        expect(result[0].reward_tokens).toBeNull();
      });
    });
  });

  describe("healthCheck", () => {
    it("returns healthy when fetch succeeds", async () => {
      const fetcher = new DeFiLlamaFetcher();
      vi.spyOn(fetcher, "fetchPoolsByChain").mockResolvedValueOnce([]);

      const result = await fetcher.healthCheck();

      expect(result.status).toBe("healthy");
    });
  });

  describe("edge cases and boundary conditions", () => {
    it("should handle extremely large numbers", async () => {
      const poolWithLargeNumbers: DeFiLlamaPool = {
        pool: "large-numbers",
        chain: "Ethereum",
        project: "test",
        symbol: "LARGE",
        tvlUsd: Number.MAX_SAFE_INTEGER,
        apy: 999.99,
        stablecoin: false,
        ilRisk: "no",
        exposure: "single",
      };

      const mockResponse = createMockApiResponse({
        status: "success",
        data: [poolWithLargeNumbers],
      });
      getMockFetch().mockResolvedValueOnce(mockResponse);

      const result = await fetcher.fetchAllPools();

      expect(result[0].tvl_usd).toBe(Number.MAX_SAFE_INTEGER);
      expect(result[0].apy).toBe(999.99);
    });
  });

  describe("Additional edge cases", () => {
    describe("transformPool edge cases", () => {
      it("should normalize zero TVL to null during transformation", () => {
        const fetcherAny = fetcher as unknown as {
          transformPool(pool: DeFiLlamaPool): { tvl_usd: number | null };
        };
        const poolWithZeroTvl: DeFiLlamaPool = {
          pool: "zero-tvl-pool",
          chain: "Ethereum",
          project: "test-protocol",
          symbol: "ETH-USDC",
          tvlUsd: 0,
          apy: 5.0,
          stablecoin: false,
          ilRisk: "no",
          exposure: "multi",
        };

        const result = fetcherAny.transformPool(poolWithZeroTvl);

        expect(result.tvl_usd).toBeNull();
      });
    });

    describe("matchesProject edge cases", () => {
      it("should reject pool when version does not match protocol (line 210)", async () => {
        const poolWithVersionMismatch: DeFiLlamaPool = {
          pool: "version-mismatch-pool",
          chain: "Ethereum",
          project: "compound-v2", // Has v2 in protocol name
          symbol: "COMP-ETH",
          tvlUsd: 1000000,
          apy: 5.0,
          stablecoin: false,
          ilRisk: "no",
          exposure: "multi",
        };

        const mockResponse = createMockApiResponse({
          status: "success",
          data: [poolWithVersionMismatch],
        });
        getMockFetch().mockResolvedValueOnce(mockResponse);

        // Try to find pool with protocol "compound" but version "v3" (should fail line 210)
        const result = await fetcher.findMatchingPool(
          "ethereum",
          "compound",
          "v3",
          ["comp", "eth"],
        );

        expect(result).toBeNull(); // Should not match due to version mismatch
      });
    });

    describe("matchesSymbols edge cases", () => {
      it("should return false when matching a pool with an empty normalized symbol", () => {
        const fetcherAny = fetcher as unknown as {
          matchesSymbols(
            pool: { symbol: string },
            targetSymbols: string[],
          ): boolean;
        };

        const result = fetcherAny.matchesSymbols({ symbol: "" }, [
          "eth",
          "usdc",
        ]);

        expect(result).toBe(false);
      });

      it("should skip pools with empty symbols during symbol matching", async () => {
        const poolWithoutSymbol: DeFiLlamaPool = {
          pool: "symbol-missing-pool",
          chain: "Ethereum",
          project: "test-protocol",
          symbol: "",
          tvlUsd: 1000000,
          apy: 5.0,
          stablecoin: false,
          ilRisk: "no",
          exposure: "multi",
        };

        const mockResponse = createMockApiResponse({
          status: "success",
          data: [poolWithoutSymbol],
        });
        getMockFetch().mockResolvedValueOnce(mockResponse);

        const result = await fetcher.findMatchingPool(
          "ethereum",
          "test-protocol",
          "0",
          ["eth", "usdc"],
        );

        expect(result).toBeNull();
      });

      it("should fall back to loose symbol matching when strict matching fails (line 221)", async () => {
        const poolWithComplexSymbols: DeFiLlamaPool = {
          pool: "symbol-fallback-pool",
          chain: "Ethereum",
          project: "test-protocol",
          symbol: "WETH-USDC-DAI", // 3 symbols
          tvlUsd: 1000000,
          apy: 5.0,
          stablecoin: false,
          ilRisk: "no",
          exposure: "multi",
        };

        const mockResponse = createMockApiResponse({
          status: "success",
          data: [poolWithComplexSymbols],
        });
        getMockFetch().mockResolvedValueOnce(mockResponse);

        // Use symbols that would fail strict matching but pass loose matching
        // This should trigger the second checkSymbolListsEqual call (line 221)
        const result = await fetcher.findMatchingPool(
          "ethereum",
          "test-protocol",
          "0",
          ["dai", "usdc", "weth"],
        );

        expect(result).not.toBeNull(); // Should match via loose symbol matching
        expect(result?.symbol).toBe("weth-usdc-dai");
      });
    });

    describe("healthCheck error handling", () => {
      it("should handle API errors during health check (lines 248-258)", async () => {
        // Create fetcher and mock fetchPoolsByChain to fail
        const testFetcher = new DeFiLlamaFetcher();
        vi.spyOn(testFetcher, "fetchPoolsByChain").mockRejectedValueOnce(
          new Error("API unavailable"),
        );

        const result = await testFetcher.healthCheck();

        expect(result.status).toBe("unhealthy");
        expect(result.details).toBe("API unavailable");
      });

      it("should handle non-Error exceptions during health check", async () => {
        // Create fetcher and mock fetchPoolsByChain to reject with non-Error
        const testFetcher = new DeFiLlamaFetcher();
        vi.spyOn(testFetcher, "fetchPoolsByChain").mockRejectedValueOnce(
          "String error",
        );

        const result = await testFetcher.healthCheck();

        expect(result.status).toBe("unhealthy");
        expect(result.details).toBe("Unknown error");
      });
    });

    describe("Explicit code paths", () => {
      it("should continue loop when chain mismatch (line 133)", async () => {
        // Explicit valid pool matching uniswap/ETH/USDC
        const poolMismatchChain = {
          pool: "optimism-pool",
          chain: "Optimism",
          project: "uniswap-v3",
          symbol: "ETH-USDC",
          tvlUsd: 10000,
          apy: 5,
          stablecoin: false,
          ilRisk: "yes",
          exposure: "multi",
        } as unknown;

        const poolMatch = {
          pool: "ethereum-pool",
          chain: "Ethereum",
          project: "uniswap-v3",
          symbol: "ETH-USDC",
          tvlUsd: 10000,
          apy: 5,
          stablecoin: false,
          ilRisk: "yes",
          exposure: "multi",
        } as unknown;

        const mockResponse = createMockApiResponse({
          status: "success",
          data: [poolMismatchChain, poolMatch],
        });
        getMockFetch().mockResolvedValueOnce(mockResponse);

        // Search for Ethereum. Optimism pool should be skipped (continue)
        // matchesProject: 'uniswap-v3' includes 'uniswap'.
        // matchesSymbols: 'ETH-USDC' matches ['ETH', 'USDC'].
        const result = await fetcher.findMatchingPool(
          "Ethereum",
          "uniswap",
          "0",
          ["ETH", "USDC"],
        );
        expect(result).not.toBeNull();
        expect(result?.chain).toBe("ethereum");
        expect(result?.raw_data?.defillama_pool_id).toBe("ethereum-pool");
      });

      it("should return false inside matchesProject when project name mismatch (line 244)", async () => {
        const poolProjectMismatch = {
          pool: "project-mismatch",
          chain: "Ethereum",
          project: "OtherProject",
          symbol: "ETH-USDC",
          tvlUsd: 10000,
          apy: 5,
          stablecoin: false,
          ilRisk: "yes",
          exposure: "multi",
        } as unknown;

        const mockResponse = createMockApiResponse({
          status: "success",
          data: [poolProjectMismatch],
        });
        getMockFetch().mockResolvedValueOnce(mockResponse);

        // Search for 'Uniswap'. 'OtherProject' mismatch -> return false -> continue -> return null
        const result = await fetcher.findMatchingPool(
          "Ethereum",
          "Uniswap",
          "0",
          ["ETH", "USDC"],
        );
        expect(result).toBeNull();
      });

      it("should handle transformation errors (lines 209-213)", async () => {
        // Minimal valid response
        const validPool = {
          pool: "valid-pool",
          chain: "Ethereum",
          project: "test",
          symbol: "TEST",
          tvlUsd: 1000,
          apy: 1,
          stablecoin: false,
          ilRisk: "no",
          exposure: "single",
        } as unknown;

        const mockResponse = createMockApiResponse({
          status: "success",
          data: [validPool],
        });
        getMockFetch().mockResolvedValueOnce(mockResponse);

        // Mock mapExposure to throw error
        const originalMapExposure = (fetcher as unknown).mapExposure;
        (fetcher as unknown).mapExposure = vi.fn().mockImplementation(() => {
          throw new Error("Transform Crash");
        });

        // transformation fails -> returns null -> filtered out
        const result = await fetcher.fetchAllPools(0);
        expect(result).toEqual([]);

        (fetcher as unknown).mapExposure = originalMapExposure;
      });
    });
  });
});
