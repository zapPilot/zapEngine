import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ETLJob, DataSource } from "../../src/types/index.js";
import { testScenarios, testUtils } from "../fixtures/fixtures.js";

const createRequestStats = () => ({ requestCount: 0, lastRequestTime: null });

// Create mock factory functions
const createMockDefiLlamaFetcher = () => ({
  fetchAllPools: vi.fn(),
  fetchPoolsByChain: vi.fn(),
  getRequestStats: vi.fn().mockReturnValue(createRequestStats()),
  checkHealth: vi.fn().mockResolvedValue(true),
});

const createMockPendleFetcher = () => ({
  fetchMarketsByChain: vi.fn(),
  getRequestStats: vi.fn().mockReturnValue(createRequestStats()),
  checkHealth: vi.fn().mockResolvedValue(true),
});

const createMockPoolWriter = () => ({
  writePoolSnapshots: vi.fn().mockResolvedValue({
    success: true,
    recordsInserted: 0,
    errors: [],
    duplicatesSkipped: 0,
  }),
});

const createMockHyperliquidFetcher = () => ({
  getVaultDetails: vi.fn(),
  extractPositionData: vi.fn(),
  extractAprData: vi.fn(),
  healthCheck: vi.fn().mockResolvedValue({ status: "healthy" }),
  getRequestStats: vi.fn().mockReturnValue(createRequestStats()),
});

const createMockSupabaseFetcher = () => {
  const fetchVipUsers = vi.fn().mockResolvedValue([]);

  return {
    fetchVipUsers,
    fetchVipUsersWithActivity: fetchVipUsers,
    healthCheck: vi.fn().mockResolvedValue({ status: "healthy" }),
    getRequestStats: vi.fn().mockReturnValue(createRequestStats()),
  };
};

const createMockPortfolioWriter = () => ({
  writeSnapshots: vi.fn().mockResolvedValue({
    success: true,
    recordsInserted: 0,
    errors: [],
    duplicatesSkipped: 0,
  }),
});

const createMockAprWriter = () => ({
  writeSnapshots: vi.fn().mockResolvedValue({
    success: true,
    recordsInserted: 0,
    errors: [],
    duplicatesSkipped: 0,
  }),
});

// Create global mock instances
let mockDefiLlamaFetcher: ReturnType<typeof createMockDefiLlamaFetcher>;
let mockPendleFetcher: ReturnType<typeof createMockPendleFetcher>;
let mockPoolWriter: ReturnType<typeof createMockPoolWriter>;
let mockHyperliquidFetcher: ReturnType<typeof createMockHyperliquidFetcher>;
let mockSupabaseFetcher: ReturnType<typeof createMockSupabaseFetcher>;
let mockPortfolioWriter: ReturnType<typeof createMockPortfolioWriter>;
let mockAprWriter: ReturnType<typeof createMockAprWriter>;

// Mock external dependencies - these need to be hoisted
vi.mock("../../src/modules/pool/fetcher.js", () => ({
  DeFiLlamaFetcher: vi.fn().mockImplementation(function DeFiLlamaFetcher() {
    return mockDefiLlamaFetcher;
  }),
}));

vi.mock("../../src/services/fetchers/pendle.js", () => ({
  PendleFetcher: vi.fn().mockImplementation(function PendleFetcher() {
    return mockPendleFetcher;
  }),
}));

vi.mock("../../src/modules/pool/writer.js", () => ({
  PoolWriter: vi.fn().mockImplementation(function PoolWriter() {
    return mockPoolWriter;
  }),
}));

vi.mock("../../src/modules/hyperliquid/fetcher.js", () => ({
  HyperliquidFetcher: vi.fn().mockImplementation(function HyperliquidFetcher() {
    return mockHyperliquidFetcher;
  }),
}));

vi.mock("../../src/modules/vip-users/supabaseFetcher.js", () => ({
  SupabaseFetcher: vi.fn().mockImplementation(function SupabaseFetcher() {
    return mockSupabaseFetcher;
  }),
}));

vi.mock("../../src/modules/wallet/portfolioWriter.js", () => ({
  PortfolioItemWriter: vi
    .fn()
    .mockImplementation(function PortfolioItemWriter() {
      return mockPortfolioWriter;
    }),
}));

vi.mock("../../src/modules/hyperliquid/aprWriter.js", () => ({
  HyperliquidVaultAprWriter: vi
    .fn()
    .mockImplementation(function HyperliquidVaultAprWriter() {
      return mockAprWriter;
    }),
}));

// Import after mocks are set up
const { ETLPipelineFactory } =
  await import("../../src/modules/core/pipelineFactory.js");
const { PoolDataTransformer } =
  await import("../../src/modules/pool/transformer.js");

describe("ETL Pipeline Integration (Core Tests)", () => {
  let processor: ETLPipelineFactory;

  beforeEach(() => {
    // Create fresh mock instances for each test
    mockDefiLlamaFetcher = createMockDefiLlamaFetcher();
    mockPendleFetcher = createMockPendleFetcher();
    mockPoolWriter = createMockPoolWriter();
    mockHyperliquidFetcher = createMockHyperliquidFetcher();
    mockSupabaseFetcher = createMockSupabaseFetcher();
    mockPortfolioWriter = createMockPortfolioWriter();
    mockAprWriter = createMockAprWriter();

    // Set up default mock responses with actual test data
    mockDefiLlamaFetcher.fetchAllPools.mockResolvedValue([
      testScenarios.defillamaHighYield,
      testScenarios.zeroYield,
    ]);
    mockDefiLlamaFetcher.fetchPoolsByChain.mockResolvedValue([
      testScenarios.defillamaHighYield,
    ]);

    mockPendleFetcher.fetchMarketsByChain.mockResolvedValue([
      testScenarios.pendleFixedRate,
    ]);

    mockPoolWriter.writePoolSnapshots.mockResolvedValue({
      success: true,
      recordsInserted: 2,
      errors: [],
      duplicatesSkipped: 0,
    });

    processor = new ETLPipelineFactory();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const createTestJob = (
    sources: DataSource[] = ["defillama"],
    filters = {},
  ): ETLJob => ({
    jobId: `test-job-${Date.now()}`,
    trigger: "manual",
    sources,
    filters,
    createdAt: new Date(),
    status: "pending",
  });

  describe("Core ETL Flow", () => {
    it("should process DeFiLlama data through complete pipeline", async () => {
      const job = createTestJob(["defillama"], {
        chains: ["ethereum"],
        minTvl: 100000,
      });

      const result = await processor.processJob(job);

      // Assert overall success
      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBeGreaterThan(0);
      expect(result.recordsInserted).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);

      // Assert source-specific results
      expect(result.sourceResults.defillama).toBeDefined();
      expect(result.sourceResults.defillama.success).toBe(true);
      expect(result.sourceResults.defillama.recordsInserted).toBeGreaterThan(0);
    });
  });

  describe("Data Transformation", () => {
    it("should properly transform DeFiLlama APY to APR in pipeline", async () => {
      const transformer = new PoolDataTransformer();

      // Test that the transformation pipeline converts APY to APR correctly
      const transformed = transformer.transform(
        testScenarios.defillamaHighYield,
      );

      testUtils.expectValidTransformation(transformed);
      expect(transformed?.source).toBe("defillama");

      // Verify APY was converted to APR using daily compounding
      testUtils.expectFinancialPrecision(
        transformed!.apr,
        0.3293, // Expected APR from 39% APY
        3,
      );

      // Verify symbol parsing worked
      testUtils.expectValidSymbolParsing(transformed, ["wmatic", "trumatic"]);
    });
  });

  describe("Multi-Source Processing", () => {
    it("should process hyperliquid source successfully", async () => {
      const job = createTestJob(["hyperliquid"]);

      // Mock VIP users
      const vipUsers = [
        {
          user_id: "test-user-1",
          wallet: "0x1234567890123456789012345678901234567890",
          plan: "vip" as const,
          created_at: new Date().toISOString(),
        },
      ];
      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue(vipUsers);

      // Mock Hyperliquid API response
      const vaultResponse = {
        vaultAddress: "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303",
        leader: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
        name: "HLP Vault",
        description: "Hyperliquid Vault",
        apr: 0.25,
        totalVlm: 15000000,
        leaderCommission: 0.1,
        leaderFraction: 0.15,
        isClosed: false,
        allowDeposits: true,
        followerState: {
          user: vipUsers[0].wallet,
          totalAccountValue: 50000,
          vaultEquity: 50000,
          maxWithdrawable: 48000,
        },
        totalFollowers: 200,
        relationship: { type: "follower" as const },
      };

      mockHyperliquidFetcher.getVaultDetails.mockResolvedValue(vaultResponse);
      mockHyperliquidFetcher.extractPositionData.mockReturnValue({
        userWallet: vipUsers[0].wallet,
        vaultAddress: vaultResponse.vaultAddress,
        vaultName: "HLP Vault",
        hlpBalance: 50000,
        vaultUsdValue: 50000,
        maxWithdrawable: 48000,
        relationshipType: "follower",
        leaderAddress: vaultResponse.leader,
        vaultDescription: vaultResponse.description,
      });
      mockHyperliquidFetcher.extractAprData.mockReturnValue({
        vaultAddress: vaultResponse.vaultAddress,
        vaultName: "HLP Vault",
        leaderAddress: vaultResponse.leader,
        apr: vaultResponse.apr,
        tvlUsd: vaultResponse.totalVlm,
        leaderCommission: vaultResponse.leaderCommission,
        leaderFraction: vaultResponse.leaderFraction,
        totalFollowers: vaultResponse.totalFollowers,
        isClosed: false,
        allowDeposits: true,
      });

      mockPortfolioWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });
      mockAprWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      const result = await processor.processJob(job);

      // Assert overall success
      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBeGreaterThan(0);
      expect(result.recordsInserted).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);

      // Assert source-specific results
      expect(result.sourceResults.hyperliquid).toBeDefined();
      expect(result.sourceResults.hyperliquid.success).toBe(true);
      expect(result.sourceResults.hyperliquid.recordsInserted).toBeGreaterThan(
        0,
      );
    });

    it("should process multiple sources in parallel", async () => {
      const job = createTestJob(["defillama", "hyperliquid"]);

      // Mock Hyperliquid data
      const vipUsers = [
        {
          user_id: "test-user-1",
          wallet: "0x1234567890123456789012345678901234567890",
          plan: "vip" as const,
          created_at: new Date().toISOString(),
        },
      ];
      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue(vipUsers);

      const vaultResponse = {
        vaultAddress: "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303",
        leader: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
        name: "HLP Vault",
        apr: 0.25,
        totalVlm: 15000000,
        leaderCommission: 0.1,
        isClosed: false,
        allowDeposits: true,
        followerState: {
          user: vipUsers[0].wallet,
          totalAccountValue: 50000,
          vaultEquity: 50000,
          maxWithdrawable: 48000,
        },
        totalFollowers: 200,
        relationship: { type: "follower" as const },
      };

      mockHyperliquidFetcher.getVaultDetails.mockResolvedValue(vaultResponse);
      mockHyperliquidFetcher.extractPositionData.mockReturnValue({
        userWallet: vipUsers[0].wallet,
        vaultAddress: vaultResponse.vaultAddress,
        vaultName: "HLP Vault",
        hlpBalance: 50000,
        vaultUsdValue: 50000,
        maxWithdrawable: 48000,
        relationshipType: "follower",
        leaderAddress: vaultResponse.leader,
        vaultDescription: null,
      });
      mockHyperliquidFetcher.extractAprData.mockReturnValue({
        vaultAddress: vaultResponse.vaultAddress,
        vaultName: "HLP Vault",
        leaderAddress: vaultResponse.leader,
        apr: vaultResponse.apr,
        tvlUsd: vaultResponse.totalVlm,
        leaderCommission: vaultResponse.leaderCommission,
        leaderFraction: undefined,
        totalFollowers: vaultResponse.totalFollowers,
        isClosed: false,
        allowDeposits: true,
      });

      mockPortfolioWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });
      mockAprWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      const result = await processor.processJob(job);

      // Assert overall success
      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBeGreaterThan(0);
      expect(result.recordsInserted).toBeGreaterThan(0);

      // Assert both sources processed
      expect(result.sourceResults.defillama).toBeDefined();
      expect(result.sourceResults.hyperliquid).toBeDefined();

      expect(result.sourceResults.defillama.success).toBe(true);
      expect(result.sourceResults.hyperliquid.success).toBe(true);

      // Verify both sources contributed records
      expect(result.sourceResults.defillama.recordsInserted).toBeGreaterThan(0);
      expect(result.sourceResults.hyperliquid.recordsInserted).toBeGreaterThan(
        0,
      );

      // Total records should be sum of both sources
      const totalInserted =
        result.sourceResults.defillama.recordsInserted +
        result.sourceResults.hyperliquid.recordsInserted;
      expect(result.recordsInserted).toBe(totalInserted);
    });

    it("should handle partial failure across multiple sources", async () => {
      const job = createTestJob(["defillama", "hyperliquid"]);

      // DeFiLlama succeeds
      mockDefiLlamaFetcher.fetchAllPools.mockResolvedValue([
        testScenarios.defillamaHighYield,
      ]);
      mockPoolWriter.writePoolSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      // Hyperliquid fails
      mockSupabaseFetcher.fetchVipUsers.mockRejectedValue(
        new Error("Supabase connection timeout"),
      );

      const result = await processor.processJob(job);

      // Overall should fail due to Hyperliquid failure
      expect(result.success).toBe(false);

      // DeFiLlama should succeed
      expect(result.sourceResults.defillama).toBeDefined();
      expect(result.sourceResults.defillama.success).toBe(true);

      // Hyperliquid should fail
      expect(result.sourceResults.hyperliquid).toBeDefined();
      expect(result.sourceResults.hyperliquid.success).toBe(false);
      expect(result.sourceResults.hyperliquid.errors.length).toBeGreaterThan(0);

      // Should still have some records from successful source
      expect(result.recordsInserted).toBeGreaterThan(0);
    });
  });
});
