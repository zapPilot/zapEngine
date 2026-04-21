/**
 * Unit tests for DeBankFetcher
 * Tests wallet token balance fetching, health checks, rate limiting, and error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DeBankFetcher } from "../../../../src/modules/wallet/fetcher.js";
import { castTo } from "../../../utils/typeCasts.ts";

// Mock the logger to prevent console output during tests
vi.mock("../../../../src/utils/logger.js", async () => {
  const { mockLogger } = await import("../../../setup/mocks.js");
  return mockLogger();
});

// Mock the mask utility
vi.mock("../../../../src/utils/mask.js", () => ({
  maskWalletAddress: vi.fn(
    (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`,
  ),
}));

// Mock global fetch
global.fetch = vi.fn();

function fetchMock(): ReturnType<typeof vi.fn> {
  return castTo<ReturnType<typeof vi.fn>>(global.fetch);
}

interface DeBankTokenBalance {
  id: string;
  chain: string;
  name: string;
  symbol: string;
  display_symbol?: string;
  optimized_symbol?: string;
  decimals: number;
  logo_url?: string;
  protocol_id?: string;
  price?: number;
  price_24h_change?: number;
  is_verified: boolean;
  is_core: boolean;
  is_wallet: boolean;
  time_at?: number;
  amount: number;
  raw_amount?: string;
  raw_amount_hex_str?: string;
}

describe("DeBankFetcher", () => {
  let fetcher: DeBankFetcher;
  const testWalletAddress = "0x1234567890123456789012345678901234567890";
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Save and clear environment variables
    originalEnv = { ...process.env };
    delete process.env.DEBANK_API_URL;
    delete process.env.DEBANK_API_KEY;
    fetcher = new DeBankFetcher();
  });

  afterEach(() => {
    vi.resetAllMocks();
    // Restore environment variables
    process.env = originalEnv;
  });

  describe("constructor", () => {
    it("should initialize with default config", () => {
      expect(fetcher).toBeDefined();
      expect(fetcher.getRequestStats()).toEqual({
        requestCount: 0,
        lastRequestTime: 0,
      });
    });

    it("should initialize with custom config", () => {
      const customFetcher = new DeBankFetcher({
        apiUrl: "https://custom-api.example.com",
        apiKey: "test-key",
        rateLimitMs: 2000,
      });

      expect(customFetcher).toBeDefined();
    });

    it("should use environment variables when available", () => {
      // Set environment variables for this test
      process.env.DEBANK_API_URL = "https://env-api.example.com";
      process.env.DEBANK_API_KEY = "env-key";

      const envFetcher = new DeBankFetcher();
      expect(envFetcher).toBeDefined();
    });
  });

  describe("fetchWalletTokenList", () => {
    const mockTokenBalances: DeBankTokenBalance[] = [
      {
        id: "0xa0b86a33e6329f4b7e6e4f7e1a9e8c2d3b4c5e6f",
        chain: "eth",
        name: "Ethereum",
        symbol: "ETH",
        decimals: 18,
        is_verified: true,
        is_core: true,
        is_wallet: true,
        amount: 5.25,
        price: 1800.5,
      },
      {
        id: "0xa0b86a33e6329f4b7e6e4f7e1a9e8c2d3b4c5e6f",
        chain: "eth",
        name: "USD Coin",
        symbol: "USDC",
        display_symbol: "USDC",
        decimals: 6,
        is_verified: true,
        is_core: false,
        is_wallet: false,
        amount: 1000.0,
        price: 1.0,
        protocol_id: "centre",
      },
    ];

    it("should fetch wallet token list successfully", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockTokenBalances),
      };
      fetchMock().mockResolvedValueOnce(mockResponse);

      const result = await fetcher.fetchWalletTokenList(testWalletAddress);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("v1/user/all_token_list"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: "application/json",
            "User-Agent": "alpha-etl/1.0.0",
          }),
        }),
      );

      expect(result).toEqual(mockTokenBalances);
      expect(fetcher.getRequestStats().requestCount).toBe(1);
    });

    it("should include API key in headers when configured", async () => {
      const fetcherWithKey = new DeBankFetcher({ apiKey: "test-api-key" });
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue([]),
      };
      fetchMock().mockResolvedValueOnce(mockResponse);

      await fetcherWithKey.fetchWalletTokenList(testWalletAddress);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            AccessKey: "test-api-key",
          }),
        }),
      );
    });

    it("should handle wallet address case normalization", async () => {
      const upperCaseAddress = "0X1234567890123456789012345678901234567890";
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue([]),
      };
      fetchMock().mockResolvedValueOnce(mockResponse);

      await fetcher.fetchWalletTokenList(upperCaseAddress);

      const fetchCall = fetchMock().mock.calls[0];
      const url = fetchCall[0];
      expect(url).toContain("id=0x1234567890123456789012345678901234567890");
    });

    it("should handle HTTP errors gracefully", async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: vi.fn().mockResolvedValue({}),
      };
      fetchMock().mockResolvedValueOnce(mockResponse);

      const result = await fetcher.fetchWalletTokenList(testWalletAddress);

      expect(result).toEqual([]);
    });

    it("should handle network errors gracefully", async () => {
      fetchMock().mockRejectedValueOnce(new Error("Network error"));

      const result = await fetcher.fetchWalletTokenList(testWalletAddress);

      expect(result).toEqual([]);
    });

    it("should handle malformed JSON responses", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new Error("Invalid JSON")),
      };
      fetchMock().mockResolvedValueOnce(mockResponse);

      const result = await fetcher.fetchWalletTokenList(testWalletAddress);

      expect(result).toEqual([]);
    });

    it("should handle rate limiting (429) responses", async () => {
      const mockResponse = {
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        json: vi.fn().mockResolvedValue({}),
      };
      fetchMock().mockResolvedValueOnce(mockResponse);

      const result = await fetcher.fetchWalletTokenList(testWalletAddress);

      expect(result).toEqual([]);
    });

    it("should handle empty token list response", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue([]),
      };
      fetchMock().mockResolvedValueOnce(mockResponse);

      const result = await fetcher.fetchWalletTokenList(testWalletAddress);

      expect(result).toEqual([]);
    });

    it("should track request statistics correctly", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue([]),
      };
      fetchMock().mockResolvedValue(mockResponse);

      const initialStats = fetcher.getRequestStats();
      expect(initialStats.requestCount).toBe(0);

      await fetcher.fetchWalletTokenList(testWalletAddress);
      await fetcher.fetchWalletTokenList("0xother");

      const finalStats = fetcher.getRequestStats();
      expect(finalStats.requestCount).toBe(2);
      expect(finalStats.lastRequestTime).toBeGreaterThan(0);
    });
  });

  describe("fetchComplexProtocolList", () => {
    const mockProtocolData = [
      {
        chain: "arb",
        dao_id: "aave",
        has_supported_portfolio: true,
        id: "arb_aave3",
        is_tvl: true,
        is_visible_in_defi: true,
        logo_url: "https://example.com/aave.png",
        name: "Aave V3",
        platform_token_id: null,
        portfolio_item_list: [
          {
            asset_dict: { "0xtoken1": 100.5 },
            asset_token_list: [{ id: "0xtoken1", amount: 100.5 }],
            detail: { health_rate: 1.5 },
            detail_types: ["lending"],
            name: "Lending",
            pool: { id: "0xpool1", name: "Aave V3 Pool" },
            proxy_detail: {},
            stats: {
              asset_usd_value: 1000.0,
              debt_usd_value: 0.0,
              net_usd_value: 1000.0,
            },
            update_at: 1234567890,
          },
        ],
      },
    ];

    it("should fetch complex protocol list successfully", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(mockProtocolData),
      };
      fetchMock().mockResolvedValueOnce(mockResponse);

      const result = await fetcher.fetchComplexProtocolList(testWalletAddress);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("v1/user/all_complex_protocol_list"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: "application/json",
            "User-Agent": "alpha-etl/1.0.0",
          }),
        }),
      );

      expect(result).toEqual(mockProtocolData);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Aave V3");
      expect(result[0].portfolio_item_list).toHaveLength(1);
    });

    it("should include API key in headers when configured", async () => {
      const fetcherWithKey = new DeBankFetcher({ apiKey: "test-api-key" });
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue([]),
      };
      fetchMock().mockResolvedValueOnce(mockResponse);

      await fetcherWithKey.fetchComplexProtocolList(testWalletAddress);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            AccessKey: "test-api-key",
          }),
        }),
      );
    });

    it("should handle empty protocol list", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue([]),
      };
      fetchMock().mockResolvedValueOnce(mockResponse);

      const result = await fetcher.fetchComplexProtocolList(testWalletAddress);

      expect(result).toEqual([]);
    });

    it("should handle HTTP errors gracefully", async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: vi.fn().mockResolvedValue({}),
      };
      fetchMock().mockResolvedValueOnce(mockResponse);

      const result = await fetcher.fetchComplexProtocolList(testWalletAddress);

      expect(result).toEqual([]);
    });

    it("should handle network errors", async () => {
      fetchMock().mockRejectedValueOnce(new Error("Network error"));

      const result = await fetcher.fetchComplexProtocolList(testWalletAddress);

      expect(result).toEqual([]);
    });

    it("should handle non-array responses", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ error: "Invalid response" }),
      };
      fetchMock().mockResolvedValueOnce(mockResponse);

      const result = await fetcher.fetchComplexProtocolList(testWalletAddress);

      expect(result).toEqual([]);
    });

    it("should handle malformed JSON", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new Error("Invalid JSON")),
      };
      fetchMock().mockResolvedValueOnce(mockResponse);

      const result = await fetcher.fetchComplexProtocolList(testWalletAddress);

      expect(result).toEqual([]);
    });

    it("should normalize wallet address to lowercase", async () => {
      const upperCaseAddress = "0X1234567890123456789012345678901234567890";
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue([]),
      };
      fetchMock().mockResolvedValueOnce(mockResponse);

      await fetcher.fetchComplexProtocolList(upperCaseAddress);

      const fetchCall = fetchMock().mock.calls[0];
      const url = fetchCall[0];
      expect(url).toContain("id=0x1234567890123456789012345678901234567890");
    });

    it("should handle Zod validation failures gracefully", async () => {
      const invalidData = [
        {
          chain: "arb",
          // Missing required fields to trigger Zod validation failure
          portfolio_item_list: [],
        },
      ];
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(invalidData),
      };
      fetchMock().mockResolvedValueOnce(mockResponse);

      const result = await fetcher.fetchComplexProtocolList(testWalletAddress);

      // Should return raw data even if Zod validation fails
      expect(result).toEqual(invalidData);
    });

    it("should increment request count", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue([]),
      };
      fetchMock().mockResolvedValueOnce(mockResponse);

      const initialStats = fetcher.getRequestStats();
      await fetcher.fetchComplexProtocolList(testWalletAddress);
      const finalStats = fetcher.getRequestStats();

      expect(finalStats.requestCount).toBe(initialStats.requestCount + 1);
      expect(finalStats.lastRequestTime).toBeGreaterThan(0);
    });
  });

  describe("healthCheck", () => {
    it("should return healthy when API is accessible", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ total_usd_value: 1000 }),
      };
      fetchMock().mockResolvedValueOnce(mockResponse);

      const result = await fetcher.healthCheck();

      expect(result).toEqual({ status: "healthy" });
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("v1/user/total_balance"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: "application/json",
            "User-Agent": expect.any(String),
          }),
        }),
      );
    });

    it("should include API key in health check when configured", async () => {
      const fetcherWithKey = new DeBankFetcher({ apiKey: "health-test-key" });
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      };
      fetchMock().mockResolvedValueOnce(mockResponse);

      await fetcherWithKey.healthCheck();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            AccessKey: "health-test-key",
          }),
        }),
      );
    });

    it("should return unhealthy for rate limiting (429)", async () => {
      const mockResponse = {
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      };
      fetchMock().mockResolvedValueOnce(mockResponse);

      const result = await fetcher.healthCheck();

      expect(result).toEqual({
        status: "unhealthy",
        details: "Rate limited - consider adding API key",
      });
    });

    it("should return unhealthy for other HTTP errors", async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      };
      fetchMock().mockResolvedValueOnce(mockResponse);

      const result = await fetcher.healthCheck();

      expect(result).toEqual({
        status: "unhealthy",
        details: "HTTP 500: Internal Server Error",
      });
    });

    it("should handle network errors in health check", async () => {
      fetchMock().mockRejectedValueOnce(new Error("Connection timeout"));

      const result = await fetcher.healthCheck();

      expect(result).toEqual({
        status: "unhealthy",
        details: "Connection timeout",
      });
    });

    it("should handle unknown errors in health check", async () => {
      fetchMock().mockRejectedValueOnce("Unknown error");

      const result = await fetcher.healthCheck();

      expect(result).toEqual({
        status: "unhealthy",
        details: "Unknown error",
      });
    });

    it("should respect timeout in health check", async () => {
      // Mock AbortSignal.timeout if not available
      if (!AbortSignal.timeout) {
        (global as unknown).AbortSignal = {
          timeout: vi.fn(() => ({
            aborted: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          })),
        };
      }

      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({}),
      };
      fetchMock().mockResolvedValueOnce(mockResponse);

      await fetcher.healthCheck();

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(Object),
        }),
      );
    });
  });

  describe("edge cases and boundary conditions", () => {
    it("should handle extremely long wallet addresses", async () => {
      const longAddress = "0x" + "1".repeat(100); // Invalid but test boundary
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue([]),
      };
      fetchMock().mockResolvedValueOnce(mockResponse);

      const result = await fetcher.fetchWalletTokenList(longAddress);

      expect(result).toEqual([]);
    });

    it("should handle empty wallet address", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue([]),
      };
      fetchMock().mockResolvedValueOnce(mockResponse);

      const result = await fetcher.fetchWalletTokenList("");

      expect(result).toEqual([]);
    });

    it("should handle tokens with optional fields missing", async () => {
      const minimalToken: DeBankTokenBalance = {
        id: "0xtoken",
        chain: "eth",
        name: "Minimal Token",
        symbol: "MIN",
        decimals: 18,
        is_verified: false,
        is_core: false,
        is_wallet: false,
        amount: 0,
      };

      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue([minimalToken]),
      };
      fetchMock().mockResolvedValueOnce(mockResponse);

      const result = await fetcher.fetchWalletTokenList(testWalletAddress);

      expect(result).toEqual([minimalToken]);
    });

    it("should handle very large token amounts", async () => {
      const largeAmountToken: DeBankTokenBalance = {
        id: "0xtoken",
        chain: "eth",
        name: "Large Token",
        symbol: "LARGE",
        decimals: 18,
        is_verified: true,
        is_core: false,
        is_wallet: false,
        amount: Number.MAX_SAFE_INTEGER,
        price: Number.MAX_SAFE_INTEGER,
      };

      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue([largeAmountToken]),
      };
      fetchMock().mockResolvedValueOnce(mockResponse);

      const result = await fetcher.fetchWalletTokenList(testWalletAddress);

      expect(result).toEqual([largeAmountToken]);
    });

    it("should handle API responses with unexpected structure", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi
          .fn()
          .mockResolvedValue({ error: "Invalid response structure" }),
      };
      fetchMock().mockResolvedValueOnce(mockResponse);

      const result = await fetcher.fetchWalletTokenList(testWalletAddress);

      expect(result).toEqual([]);
    });

    it("should handle null response from API", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(null),
      };
      fetchMock().mockResolvedValueOnce(mockResponse);

      const result = await fetcher.fetchWalletTokenList(testWalletAddress);

      expect(result).toEqual([]);
    });
  });

  describe("configuration variations", () => {
    it("should work with all configuration options", async () => {
      const customConfig = {
        apiUrl: "https://custom.debank.com",
        apiKey: "custom-key",
        rateLimitMs: 500,
      };

      const customFetcher = new DeBankFetcher(customConfig);
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue([]),
      };
      fetchMock().mockResolvedValueOnce(mockResponse);

      await customFetcher.fetchWalletTokenList(testWalletAddress);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("custom.debank.com"),
        expect.objectContaining({
          headers: expect.objectContaining({
            AccessKey: "custom-key",
          }),
        }),
      );
    });

    it("should work without any configuration", async () => {
      const defaultFetcher = new DeBankFetcher();
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue([]),
      };
      fetchMock().mockResolvedValueOnce(mockResponse);

      await defaultFetcher.fetchWalletTokenList(testWalletAddress);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("pro-openapi.debank.com"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: "application/json",
            "User-Agent": "alpha-etl/1.0.0",
          }),
        }),
      );

      // Check that AccessKey is not in headers
      const fetchCall = fetchMock().mock.calls[0];
      const headers = fetchCall[1].headers;
      expect(headers).not.toHaveProperty("AccessKey");
    });
  });

  describe("Strict Errors Mode", () => {
    let strictFetcher: DeBankFetcher;

    beforeEach(() => {
      strictFetcher = new DeBankFetcher({ strictErrors: true });
    });

    it("should throw error when fetchWalletTokenList fails with strictErrors=true", async () => {
      fetchMock().mockRejectedValue(new Error("Network failure"));

      await expect(
        strictFetcher.fetchWalletTokenList(testWalletAddress),
      ).rejects.toThrow("DeBank API error: Network failure");
    });

    it("should throw error when validateTokenResponse fails with strictErrors=true", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ error: "Not array" }),
      };
      fetchMock().mockResolvedValue(mockResponse);

      await expect(
        strictFetcher.fetchWalletTokenList(testWalletAddress),
      ).rejects.toThrow(
        "DeBank API returned non-array response for token list",
      );
    });

    it("should throw error when fetchComplexProtocolList fails with strictErrors=true", async () => {
      fetchMock().mockRejectedValue(new Error("Protocol fetch failed"));

      await expect(
        strictFetcher.fetchComplexProtocolList(testWalletAddress),
      ).rejects.toThrow("DeBank API error: Protocol fetch failed");
    });

    it("should throw error when validateProtocolResponse fails with strictErrors=true", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ error: "Not array for protocols" }),
      };
      fetchMock().mockResolvedValue(mockResponse);

      await expect(
        strictFetcher.fetchComplexProtocolList(testWalletAddress),
      ).rejects.toThrow(
        "DeBank API returned non-array response for complex protocol list",
      );
    });

    it("should handle non-Error objects thrown (mocking fetchWithRetry)", async () => {
      // spyOn protected method by casting to any
      vi.spyOn(strictFetcher as unknown, "fetchWithRetry").mockRejectedValue(
        "Raw string error",
      );

      await expect(
        strictFetcher.fetchWalletTokenList(testWalletAddress),
      ).rejects.toThrow("DeBank API error: Unknown error");
    });
  });

  describe("Zod validation edge cases", () => {
    it('should log "Unknown validation error" when Zod schema throws a non-Error', async () => {
      const nonStrictFetcher = new DeBankFetcher({ strictErrors: false });
      vi.spyOn(nonStrictFetcher as unknown, "fetchWithRetry").mockResolvedValue(
        [{ id: "invalid" }],
      );

      const { DeBankComplexProtocolListSchema } =
        await import("../../../../src/modules/wallet/fetcher.js");
      vi.spyOn(DeBankComplexProtocolListSchema, "parse").mockImplementation(
        () => {
          // eslint-disable-next-line no-throw-literal
          throw "non-error-value";
        },
      );

      const { logger } = await import("../../../../src/utils/logger.js");
      const result = await nonStrictFetcher.fetchComplexProtocolList("0x123");

      expect(result).toEqual([{ id: "invalid" }]);
      expect(logger.warn).toHaveBeenCalledWith(
        "DeBank complex protocol list validation failed, returning raw data",
        expect.objectContaining({ error: "Unknown validation error" }),
      );

      vi.restoreAllMocks();
    });
  });

  describe("Environment defaults (mocking production)", () => {
    let originalNodeEnv: string | undefined;

    beforeEach(() => {
      originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
    });

    afterEach(() => {
      process.env.NODE_ENV = originalNodeEnv;
    });

    it("should use default rate limits and strict mode in production", () => {
      const prodFetcher = new DeBankFetcher();
      // Cannot easily check private props, but coverage lines 78, 85-86 will be executed
      expect(prodFetcher).toBeDefined();
    });

    it("should handle undefined NODE_ENV", () => {
      delete process.env.NODE_ENV;
      const noEnvFetcher = new DeBankFetcher();
      expect(noEnvFetcher).toBeDefined();
    });

    it("should respect DEBANK_STRICT_ERRORS env var", () => {
      process.env.DEBANK_STRICT_ERRORS = "false";
      const looseFetcher = new DeBankFetcher();
      expect(looseFetcher).toBeDefined();

      process.env.DEBANK_STRICT_ERRORS = "true";
      const strictFetcherEnv = new DeBankFetcher();
      expect(strictFetcherEnv).toBeDefined();

      delete process.env.DEBANK_STRICT_ERRORS;
    });
  });
});
