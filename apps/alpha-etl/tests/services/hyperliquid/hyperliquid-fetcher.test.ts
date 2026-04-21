import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  HyperliquidFetcher,
  VaultDetailsResponseSchema,
  type VaultDetailsResponse,
} from "../../../src/modules/hyperliquid/fetcher.js";
import { deriveTvlFromPortfolio } from "../../../src/modules/hyperliquid/fetcher.helpers.js";

vi.mock("../../../src/config/environment.js", () => ({
  env: {
    HYPERLIQUID_API_URL: "https://api-ui.hyperliquid.xyz",
    HYPERLIQUID_RATE_LIMIT_RPM: "120",
  },
}));

vi.mock("../../../src/utils/logger.js", async () => {
  const { mockLogger } = await import("../../setup/mocks.js");
  return mockLogger();
});

describe("HyperliquidFetcher", () => {
  const wallet = "0x1234567890123456789012345678901234567890";
  const vault = "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303";

  const buildResponse = (
    overrides: Partial<VaultDetailsResponse> = {},
  ): VaultDetailsResponse => ({
    vault: vault,
    vaultAddress: vault,
    leader: "0x677d8f50e9983013d4def386a1ac30c60e536f3a",
    name: "Hyperliquid Vault",
    description: "Sample vault",
    apr: 1.2345,
    totalVlm: 1_000_000,
    leaderCommission: null,
    leaderFraction: null,
    maxDistributable: null,
    maxWithdrawable: null,
    isClosed: false,
    allowDeposits: true,
    followerState: null,
    followers: undefined,
    relationship: undefined,
    totalFollowers: undefined,
    portfolio: undefined,
    allTime: undefined,
    ...overrides,
  });

  const stubFetch = (impl: Parameters<typeof vi.fn>[0]) => {
    const fetchMock = vi.fn(impl);
    vi.stubGlobal("fetch", fetchMock as typeof fetch);
    return fetchMock;
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  describe("getVaultDetails", () => {
    let fetcher: HyperliquidFetcher;

    beforeEach(() => {
      fetcher = new HyperliquidFetcher({ rateLimitRpm: 6000 });
    });

    it("returns validated vault data when API responds successfully", async () => {
      const response = buildResponse({
        followerState: {
          user: wallet,
          totalAccountValue: 123.45,
          maxWithdrawable: 100,
        },
      });

      const fetchMock = stubFetch(
        async () =>
          ({
            ok: true,
            json: async () => response,
          }) as Response,
      );

      const result = await fetcher.getVaultDetails(wallet, vault);

      expect(result.vaultAddress).toBe(vault);
      expect(result.apr).toBe(1.2345);
      expect(result.followerState?.user).toBe(wallet);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api-ui.hyperliquid.xyz/info",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });

    it("throws when API response fails schema validation", async () => {
      stubFetch(
        async () =>
          ({
            ok: true,
            json: async () => ({}) as VaultDetailsResponse,
          }) as Response,
      );

      await expect(
        fetcher.getVaultDetails(wallet, vault),
      ).rejects.toThrowError();
    });

    it("retries on failure and succeeds on subsequent attempt", async () => {
      fetcher = new HyperliquidFetcher({
        rateLimitRpm: 6000,
        retryDelayMs: 0,
        maxRetries: 2,
      });

      const response = buildResponse({
        followerState: { user: wallet, totalAccountValue: 10 },
      });

      let callIndex = 0;
      const fetchMock = stubFetch(async () => {
        const current = callIndex++;
        if (current === 0) {
          return {
            ok: false,
            status: 500,
            statusText: "Server Error",
            json: async () => ({}),
          } as Response;
        }
        return {
          ok: true,
          json: async () => response,
        } as Response;
      });

      const result = await fetcher.getVaultDetails(wallet, vault);

      expect(result.vaultAddress).toBe(vault);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("throws after exhausting retries", async () => {
      fetcher = new HyperliquidFetcher({
        rateLimitRpm: 6000,
        retryDelayMs: 0,
        maxRetries: 2,
      });

      stubFetch(
        async () =>
          ({
            ok: false,
            status: 502,
            statusText: "Bad Gateway",
            json: async () => ({}),
          }) as Response,
      );

      await expect(fetcher.getVaultDetails(wallet, vault)).rejects.toThrow();
    });
  });

  describe("deriveTvlFromPortfolio", () => {
    it("returns null for empty portfolio", () => {
      const tvl = deriveTvlFromPortfolio([]);
      expect(tvl).toBeNull();
    });

    it("returns last numeric value when present", () => {
      const tvl = deriveTvlFromPortfolio([
        [
          "day",
          {
            accountValueHistory: [
              [0, 10],
              [1, 20.5],
            ],
          },
        ],
      ]);
      expect(tvl).toBe(20.5);
    });

    it("parses numeric string when finite", () => {
      const tvl = deriveTvlFromPortfolio([
        ["day", { accountValueHistory: [[0, "42.1"]] }],
      ]);
      expect(tvl).toBeCloseTo(42.1);
    });

    it("returns null for non-finite values", () => {
      const tvl = deriveTvlFromPortfolio([
        ["day", { accountValueHistory: [[0, Infinity]] }],
      ]);
      expect(tvl).toBeNull();
    });

    it("returns null when last point is malformed", () => {
      const tvl = deriveTvlFromPortfolio([
        ["day", { accountValueHistory: [["bad"]] }],
      ]);
      expect(tvl).toBeNull();
    });

    it("returns null when value is non-parsable string", () => {
      const tvl = deriveTvlFromPortfolio([
        ["day", { accountValueHistory: [[0, "NaNish"]] }],
      ]);
      expect(tvl).toBeNull();
    });
  });

  describe("healthCheck", () => {
    it("returns unhealthy when API call fails", async () => {
      const fetcher = new HyperliquidFetcher();
      vi.spyOn(fetcher, "getVaultDetails").mockRejectedValueOnce(
        new Error("down"),
      );

      const result = await fetcher.healthCheck();

      expect(result.status).toBe("unhealthy");
      expect(result.details).toBe("down");
    });

    it("returns healthy when API call succeeds", async () => {
      const fetcher = new HyperliquidFetcher();
      vi.spyOn(fetcher, "getVaultDetails").mockResolvedValueOnce(
        buildResponse(),
      );

      const result = await fetcher.healthCheck();

      expect(result.status).toBe("healthy");
    });
  });

  it("exposes default vault address", () => {
    const fetcher = new HyperliquidFetcher();
    expect(fetcher.getDefaultVaultAddress()).toBeDefined();
  });

  describe("extract helpers", () => {
    let fetcher: HyperliquidFetcher;

    beforeEach(() => {
      fetcher = new HyperliquidFetcher({ rateLimitRpm: 6000 });
    });

    it("extracts position data using follower state metrics", () => {
      const data = buildResponse({
        followerState: {
          user: wallet,
          totalAccountValue: undefined,
          vaultEquity: 250.5,
          maxWithdrawable: 50,
        },
      });

      const position = fetcher.extractPositionData(data, wallet);

      expect(position).not.toBeNull();
      expect(position?.userWallet).toBe(wallet);
      expect(position?.hlpBalance).toBe(250.5);
      expect(position?.maxWithdrawable).toBe(50);
    });

    it("extracts APR data and falls back to portfolio TVL", () => {
      const data = buildResponse({
        totalVlm: undefined,
        portfolio: [["day", { accountValueHistory: [[0, "42.42"]] }]],
      });

      const apr = fetcher.extractAprData(data);

      expect(apr.tvlUsd).toBeCloseTo(42.42);
      expect(apr.vaultAddress).toBe(vault);
      expect(apr.isClosed).toBe(false);
    });

    it("returns null position when follower state is missing", () => {
      const data = buildResponse({ followerState: null });

      const result = fetcher.extractPositionData(data, wallet);

      expect(result).toBeNull();
    });

    it("returns null when follower balance is not finite", () => {
      const data = buildResponse({
        followerState: {
          user: wallet,
          totalAccountValue: undefined,
          vaultEquity: "not-a-number" as unknown as number,
          maxWithdrawable: undefined,
          maxDistributable: undefined,
        },
      });

      const result = fetcher.extractPositionData(data, wallet);

      expect(result).toBeNull();
    });

    it("derives TVL from portfolio buckets when direct TVL missing", () => {
      const data = buildResponse({
        totalVlm: undefined,
        portfolio: [
          [
            "month",
            {
              accountValueHistory: [
                [0, 1],
                [1, 2],
              ],
            },
          ],
          [
            "day",
            {
              accountValueHistory: [
                [0, 10],
                [1, 20],
              ],
            },
          ],
        ],
      });

      const apr = fetcher.extractAprData(data);

      expect(apr.tvlUsd).toBe(20);
    });

    it("returns null TVL when portfolio data is unusable", () => {
      const data = buildResponse({
        totalVlm: undefined,
        portfolio: [["day", { accountValueHistory: [] }]],
      });

      const apr = fetcher.extractAprData(data);

      expect(apr.tvlUsd).toBeNull();
    });

    it("uses vault-level maxWithdrawable when follower value is missing", () => {
      const data = buildResponse({
        maxWithdrawable: 25,
        followerState: {
          user: wallet,
          totalAccountValue: 10,
          vaultEquity: undefined,
          maxWithdrawable: undefined,
        },
      });

      const position = fetcher.extractPositionData(data, wallet);

      expect(position?.maxWithdrawable).toBe(25);
    });

    it("respects allowDeposits false flag and follower list length", () => {
      const data = buildResponse({
        allowDeposits: false,
        totalFollowers: undefined,
        followers: [
          {
            user: wallet,
            vaultAddress: vault,
            totalAccountValue: 1,
            maxWithdrawable: 0,
            maxDistributable: 0,
          },
        ],
      });

      const apr = fetcher.extractAprData(data);

      expect(apr.allowDeposits).toBe(false);
      expect(apr.totalFollowers).toBe(1);
    });

    it("returns null TVL when portfolio history is non-numeric", () => {
      const data = buildResponse({
        totalVlm: undefined,
        portfolio: [["day", { accountValueHistory: [[0, "abc"]] }]],
      });

      const apr = fetcher.extractAprData(data);

      expect(apr.tvlUsd).toBeNull();
    });
  });

  describe("getVaultDetailsForUsers", () => {
    it("returns results when at least one fetch succeeds", async () => {
      const fetcher = new HyperliquidFetcher({ rateLimitRpm: 6000 });
      const success = buildResponse({
        followerState: { user: wallet, totalAccountValue: 1 },
      });

      const spy = vi.spyOn(fetcher, "getVaultDetails");
      spy.mockRejectedValueOnce(new Error("fail 1"));
      spy.mockResolvedValueOnce(success);

      const results = await fetcher.getVaultDetailsForUsers(["0x1", "0x2"]);

      expect(results).toHaveLength(1);
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it("throws APIError when all user fetches fail", async () => {
      const fetcher = new HyperliquidFetcher({ rateLimitRpm: 6000 });
      const spy = vi
        .spyOn(fetcher, "getVaultDetails")
        .mockRejectedValue(new Error("all bad"));

      await expect(
        fetcher.getVaultDetailsForUsers(["0x1", "0x2"]),
      ).rejects.toThrow("All vault detail fetches failed");

      expect(spy).toHaveBeenCalledTimes(2);
    });

    it("records unknown errors for non-Error rejections", async () => {
      const fetcher = new HyperliquidFetcher({ rateLimitRpm: 6000 });
      const spy = vi.spyOn(fetcher, "getVaultDetails");
      spy.mockRejectedValueOnce("string failure");
      spy.mockResolvedValueOnce(buildResponse());

      const results = await fetcher.getVaultDetailsForUsers(["0x1", "0x2"]);

      expect(results).toHaveLength(1);
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });

  describe("schema numeric coercion", () => {
    it("coerces numeric strings to numbers", () => {
      const parsed = VaultDetailsResponseSchema.parse({
        vault: vault,
        vaultAddress: vault,
        leader: "0xleader",
        name: "Vault",
        apr: "1.5",
        totalVlm: "123",
        leaderCommission: "0.2",
        leaderFraction: "0.1",
        maxWithdrawable: null,
        maxDistributable: undefined,
        isClosed: false,
        allowDeposits: true,
        followerState: null,
        followers: [],
        relationship: undefined,
        totalFollowers: undefined,
        portfolio: undefined,
        allTime: undefined,
      });

      expect(parsed.apr).toBeCloseTo(1.5);
      expect(parsed.totalVlm).toBe(123);
      expect(parsed.leaderCommission).toBe(0.2);
      expect(parsed.leaderFraction).toBe(0.1);
      expect(parsed.maxWithdrawable).toBeUndefined();
    });
  });

  describe("healthCheck", () => {
    let fetcher: HyperliquidFetcher;

    beforeEach(() => {
      fetcher = new HyperliquidFetcher({ rateLimitRpm: 6000 });
    });

    it("returns healthy when vault details can be fetched", async () => {
      stubFetch(
        async () =>
          ({
            ok: true,
            json: async () => buildResponse(),
          }) as Response,
      );

      const result = await fetcher.healthCheck();
      expect(result.status).toBe("healthy");
    });

    it("returns unhealthy when the request fails", async () => {
      stubFetch(async () => {
        throw new Error("network");
      });

      const result = await fetcher.healthCheck();
      expect(result.status).toBe("unhealthy");
      expect(result.details).toBe("network");
    });
  });
});
