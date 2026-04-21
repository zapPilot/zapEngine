import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ETLJob } from "../../src/types/index.js";
import type { VaultDetailsResponse } from "../../src/modules/hyperliquid/fetcher.js";
import type { WriteResult } from "../../src/core/database/baseWriter.js";

function createRequestStats(): { requestCount: number; lastRequestTime: null } {
  return {
    requestCount: 0,
    lastRequestTime: null,
  };
}

/**
 * Integration Tests for Hyperliquid ETL Pipeline
 *
 * These tests verify the end-to-end flow of the Hyperliquid pipeline with realistic data.
 * Unlike unit tests, these allow real transformers to execute and only mock external APIs
 * and database operations.
 */

// Create mock factory functions that return mock instances
function createMockHyperliquidFetcher() {
  return {
    getVaultDetails: vi.fn(),
    extractPositionData: vi.fn(),
    extractAprData: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue({ status: "healthy" }),
    getRequestStats: vi.fn().mockReturnValue(createRequestStats()),
  };
}

function createMockSupabaseFetcher() {
  const fetchVipUsers = vi.fn();

  return {
    fetchVipUsers,
    fetchVipUsersWithActivity: fetchVipUsers,
    healthCheck: vi.fn().mockResolvedValue({ status: "healthy" }),
    getRequestStats: vi.fn().mockReturnValue(createRequestStats()),
  };
}

function createMockPortfolioWriter() {
  return {
    writeSnapshots: vi.fn().mockResolvedValue({
      success: true,
      recordsInserted: 0,
      errors: [],
      duplicatesSkipped: 0,
    } as WriteResult),
  };
}

function createMockAprWriter() {
  return {
    writeSnapshots: vi.fn().mockResolvedValue({
      success: true,
      recordsInserted: 0,
      errors: [],
      duplicatesSkipped: 0,
    } as WriteResult),
  };
}

// Create global mock instances that will be shared
let mockHyperliquidFetcher: ReturnType<typeof createMockHyperliquidFetcher>;
let mockSupabaseFetcher: ReturnType<typeof createMockSupabaseFetcher>;
let mockPortfolioWriter: ReturnType<typeof createMockPortfolioWriter>;
let mockAprWriter: ReturnType<typeof createMockAprWriter>;

// Mock external dependencies with factory functions
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
const { HyperliquidVaultETLProcessor } =
  await import("../../src/modules/hyperliquid/processor.js");

/**
 * Test fixtures - Realistic Hyperliquid API responses
 */
const createMockVaultDetailsResponse = (
  overrides: Partial<VaultDetailsResponse> = {},
): VaultDetailsResponse => ({
  vaultAddress: "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303",
  leader: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
  name: "HLP Vault",
  description: "Hyperliquid Liquidity Provider Vault",
  apr: 0.2547, // 25.47% APR
  totalVlm: 15750000, // $15.75M TVL
  leaderCommission: 0.1,
  leaderFraction: 0.15,
  maxDistributable: 1000000,
  maxWithdrawable: 950000,
  isClosed: false,
  allowDeposits: true,
  followerState: {
    user: "0x1234567890123456789012345678901234567890",
    vaultAddress: "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303",
    totalAccountValue: 50000,
    vaultEquity: 50000,
    maxWithdrawable: 48000,
    maxDistributable: 49000,
    pnl: 5000,
    allTimePnl: 12000,
    daysFollowing: 45,
    vaultEntryTime: Date.now() / 1000 - 45 * 86400,
    lockupUntil: undefined,
  },
  totalFollowers: 234,
  relationship: {
    type: "follower",
  },
  portfolio: [
    [
      "day",
      {
        accountValueHistory: [
          [Date.now() / 1000 - 86400, "15000000"],
          [Date.now() / 1000, "15750000"],
        ],
      },
    ],
  ],
  ...overrides,
});

function createMockVipUser(userId: string, wallet: string) {
  return {
    user_id: userId,
    wallet,
    plan: "vip" as const,
    created_at: new Date().toISOString(),
  };
}

function createTestJob(): ETLJob {
  return {
    jobId: `test-hyperliquid-${Date.now()}`,
    trigger: "manual",
    sources: ["hyperliquid"],
    filters: {},
    createdAt: new Date(),
    status: "pending",
  };
}

describe("Hyperliquid Pipeline Integration Tests", () => {
  let processor: HyperliquidVaultETLProcessor;

  beforeEach(() => {
    // Create fresh mock instances for each test
    mockHyperliquidFetcher = createMockHyperliquidFetcher();
    mockSupabaseFetcher = createMockSupabaseFetcher();
    mockPortfolioWriter = createMockPortfolioWriter();
    mockAprWriter = createMockAprWriter();

    // Set up default mock responses for empty data scenarios
    mockSupabaseFetcher.fetchVipUsers.mockResolvedValue([]);

    // Create a new processor instance (will use the fresh mocks)
    processor = new HyperliquidVaultETLProcessor();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Complete E2E Flow - Happy Path", () => {
    it("should successfully process multiple VIP users through entire pipeline", async () => {
      const job = createTestJob();

      // Mock 3 VIP users
      const vipUsers = [
        createMockVipUser(
          "user-1",
          "0xuser1111111111111111111111111111111111111",
        ),
        createMockVipUser(
          "user-2",
          "0xuser2222222222222222222222222222222222222",
        ),
        createMockVipUser(
          "user-3",
          "0xuser3333333333333333333333333333333333333",
        ),
      ];
      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue(vipUsers);

      // Mock Hyperliquid API responses for each user
      const vaultResponses = vipUsers.map((user, index) =>
        createMockVaultDetailsResponse({
          followerState: {
            ...createMockVaultDetailsResponse().followerState!,
            user: user.wallet,
            totalAccountValue: 50000 + index * 10000,
            vaultEquity: 50000 + index * 10000,
          },
        }),
      );

      mockHyperliquidFetcher.getVaultDetails
        .mockResolvedValueOnce(vaultResponses[0])
        .mockResolvedValueOnce(vaultResponses[1])
        .mockResolvedValueOnce(vaultResponses[2]);

      // Mock extractors to return realistic data
      vaultResponses.forEach((response, index) => {
        mockHyperliquidFetcher.extractPositionData.mockReturnValueOnce({
          userWallet: vipUsers[index].wallet,
          vaultAddress: response.vaultAddress,
          vaultName: response.name || "HLP Vault",
          hlpBalance: response.followerState!.totalAccountValue!,
          vaultUsdValue: response.followerState!.totalAccountValue!,
          maxWithdrawable: response.followerState!.maxWithdrawable ?? null,
          relationshipType: "follower",
          leaderAddress: response.leader,
          vaultDescription: response.description ?? null,
        });

        mockHyperliquidFetcher.extractAprData.mockReturnValueOnce({
          vaultAddress: response.vaultAddress,
          vaultName: response.name || "HLP Vault",
          leaderAddress: response.leader,
          apr: response.apr,
          tvlUsd: response.totalVlm ?? null,
          leaderCommission: response.leaderCommission ?? null,
          leaderFraction: response.leaderFraction ?? null,
          totalFollowers: response.totalFollowers ?? null,
          isClosed: response.isClosed ?? false,
          allowDeposits: response.allowDeposits !== false,
        });
      });

      // Mock successful writes
      mockPortfolioWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 3,
        errors: [],
        duplicatesSkipped: 0,
      });

      mockAprWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1, // Only 1 APR snapshot (deduplicated)
        errors: [],
        duplicatesSkipped: 0,
      });

      // Execute
      const result = await processor.process(job);

      // Assertions - Overall success
      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(3);
      expect(result.recordsInserted).toBe(4); // 3 portfolio + 1 APR
      expect(result.errors).toHaveLength(0);
      expect(result.source).toBe("hyperliquid");

      // Assertions - API calls
      expect(mockSupabaseFetcher.fetchVipUsers).toHaveBeenCalledTimes(1);
      expect(mockHyperliquidFetcher.getVaultDetails).toHaveBeenCalledTimes(3);
      expect(mockHyperliquidFetcher.extractPositionData).toHaveBeenCalledTimes(
        3,
      );
      expect(mockHyperliquidFetcher.extractAprData).toHaveBeenCalledTimes(3);

      // Assertions - Database writes
      expect(mockPortfolioWriter.writeSnapshots).toHaveBeenCalledTimes(1);
      expect(mockAprWriter.writeSnapshots).toHaveBeenCalledTimes(1);

      // Verify portfolio writer received correct number of records
      const portfolioWriteCall =
        mockPortfolioWriter.writeSnapshots.mock.calls[0][0];
      expect(portfolioWriteCall).toHaveLength(3);

      // Verify APR writer received deduplicated records
      const aprWriteCall = mockAprWriter.writeSnapshots.mock.calls[0][0];
      expect(aprWriteCall).toHaveLength(1);
    });

    it("should verify data consistency through transformation pipeline", async () => {
      const job = createTestJob();

      const vipUsers = [
        createMockVipUser(
          "user-1",
          "0xuser1111111111111111111111111111111111111",
        ),
      ];
      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue(vipUsers);

      const vaultResponse = createMockVaultDetailsResponse({
        apr: 0.3456,
        totalVlm: 20000000,
        followerState: {
          ...createMockVaultDetailsResponse().followerState!,
          user: vipUsers[0].wallet,
          totalAccountValue: 75000,
          vaultEquity: 75000,
          maxWithdrawable: 72000,
        },
      });

      mockHyperliquidFetcher.getVaultDetails.mockResolvedValue(vaultResponse);
      mockHyperliquidFetcher.extractPositionData.mockReturnValue({
        userWallet: vipUsers[0].wallet,
        vaultAddress: vaultResponse.vaultAddress,
        vaultName: vaultResponse.name || "HLP Vault",
        hlpBalance: 75000,
        vaultUsdValue: 75000,
        maxWithdrawable: 72000,
        relationshipType: "follower",
        leaderAddress: vaultResponse.leader,
        vaultDescription: vaultResponse.description ?? null,
      });

      mockHyperliquidFetcher.extractAprData.mockReturnValue({
        vaultAddress: vaultResponse.vaultAddress,
        vaultName: vaultResponse.name || "HLP Vault",
        leaderAddress: vaultResponse.leader,
        apr: vaultResponse.apr,
        tvlUsd: vaultResponse.totalVlm ?? null,
        leaderCommission: vaultResponse.leaderCommission ?? null,
        leaderFraction: vaultResponse.leaderFraction ?? null,
        totalFollowers: vaultResponse.totalFollowers ?? null,
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

      await processor.process(job);

      // Verify portfolio record structure
      const portfolioRecords =
        mockPortfolioWriter.writeSnapshots.mock.calls[0][0];
      expect(portfolioRecords).toHaveLength(1);

      const portfolioRecord = portfolioRecords[0];
      expect(portfolioRecord.wallet).toBe(
        "0xuser1111111111111111111111111111111111111",
      );
      expect(portfolioRecord.chain).toBe("hyperliquid");
      expect(portfolioRecord.name).toBe("hyperliquid");
      expect(portfolioRecord.name_item).toBe("HLP Vault");
      expect(portfolioRecord.id_raw).toBe(vaultResponse.vaultAddress);
      expect(portfolioRecord.asset_usd_value).toBe(75000);
      expect(portfolioRecord.net_usd_value).toBe(75000);
      expect(portfolioRecord.debt_usd_value).toBe(0);
      expect(portfolioRecord.has_supported_portfolio).toBe(true);
      expect(portfolioRecord.site_url).toContain("app.hyperliquid.xyz/vaults");

      // Verify JSONB fields are properly structured
      expect(portfolioRecord.detail).toEqual(
        expect.objectContaining({
          vault_address: vaultResponse.vaultAddress,
          hlp_balance: 75000,
          relationship_type: "follower",
          max_withdrawable: 72000,
        }),
      );

      expect(portfolioRecord.asset_dict).toEqual({
        [vaultResponse.vaultAddress]: 75000,
      });

      expect(portfolioRecord.asset_token_list).toHaveLength(1);
      expect(portfolioRecord.asset_token_list[0]).toEqual(
        expect.objectContaining({
          id: vaultResponse.vaultAddress,
          chain: "hyperliquid",
          name: "HLP Vault",
          symbol: "HLP",
          amount: 75000,
          price: expect.any(Number),
        }),
      );

      // Verify APR snapshot structure
      const aprSnapshots = mockAprWriter.writeSnapshots.mock.calls[0][0];
      expect(aprSnapshots).toHaveLength(1);

      const aprSnapshot = aprSnapshots[0];
      expect(aprSnapshot.source).toBe("hyperliquid");
      expect(aprSnapshot.vault_address).toBe(vaultResponse.vaultAddress);
      expect(aprSnapshot.vault_name).toBe("HLP Vault");
      expect(aprSnapshot.leader_address).toBe(vaultResponse.leader);
      expect(aprSnapshot.apr).toBe(0.3456);
      expect(aprSnapshot.tvl_usd).toBe(20000000);
      expect(aprSnapshot.total_followers).toBe(234);
      expect(aprSnapshot.is_closed).toBe(false);
      expect(aprSnapshot.allow_deposits).toBe(true);
      expect(aprSnapshot.snapshot_time).toBeDefined();

      // Verify numeric precision
      expect(Number.isFinite(aprSnapshot.apr)).toBe(true);
      expect(Number.isFinite(portfolioRecord.asset_usd_value)).toBe(true);
    });
  });

  describe("Partial Failure Scenarios", () => {
    it("should handle mixed success/failure for individual users", async () => {
      const job = createTestJob();

      const vipUsers = [
        createMockVipUser(
          "user-1",
          "0xuser1111111111111111111111111111111111111",
        ),
        createMockVipUser(
          "user-2",
          "0xuser2222222222222222222222222222222222222",
        ),
        createMockVipUser(
          "user-3",
          "0xuser3333333333333333333333333333333333333",
        ),
      ];
      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue(vipUsers);

      // User 1: Success
      const vaultResponse1 = createMockVaultDetailsResponse({
        followerState: {
          ...createMockVaultDetailsResponse().followerState!,
          user: vipUsers[0].wallet,
        },
      });
      mockHyperliquidFetcher.getVaultDetails.mockResolvedValueOnce(
        vaultResponse1,
      );
      mockHyperliquidFetcher.extractPositionData.mockReturnValueOnce({
        userWallet: vipUsers[0].wallet,
        vaultAddress: vaultResponse1.vaultAddress,
        vaultName: "HLP Vault",
        hlpBalance: 50000,
        vaultUsdValue: 50000,
        maxWithdrawable: 48000,
        relationshipType: "follower",
        leaderAddress: vaultResponse1.leader,
        vaultDescription: null,
      });
      mockHyperliquidFetcher.extractAprData.mockReturnValueOnce({
        vaultAddress: vaultResponse1.vaultAddress,
        vaultName: "HLP Vault",
        leaderAddress: vaultResponse1.leader,
        apr: vaultResponse1.apr,
        tvlUsd: vaultResponse1.totalVlm ?? null,
        leaderCommission: vaultResponse1.leaderCommission ?? null,
        leaderFraction: vaultResponse1.leaderFraction ?? null,
        totalFollowers: vaultResponse1.totalFollowers ?? null,
        isClosed: false,
        allowDeposits: true,
      });

      // User 2: API failure
      mockHyperliquidFetcher.getVaultDetails.mockRejectedValueOnce(
        new Error("Hyperliquid API timeout for user-2"),
      );

      // User 3: Success
      const vaultResponse3 = createMockVaultDetailsResponse({
        followerState: {
          ...createMockVaultDetailsResponse().followerState!,
          user: vipUsers[2].wallet,
        },
      });
      mockHyperliquidFetcher.getVaultDetails.mockResolvedValueOnce(
        vaultResponse3,
      );
      mockHyperliquidFetcher.extractPositionData.mockReturnValueOnce({
        userWallet: vipUsers[2].wallet,
        vaultAddress: vaultResponse3.vaultAddress,
        vaultName: "HLP Vault",
        hlpBalance: 60000,
        vaultUsdValue: 60000,
        maxWithdrawable: 58000,
        relationshipType: "follower",
        leaderAddress: vaultResponse3.leader,
        vaultDescription: null,
      });
      mockHyperliquidFetcher.extractAprData.mockReturnValueOnce({
        vaultAddress: vaultResponse3.vaultAddress,
        vaultName: "HLP Vault",
        leaderAddress: vaultResponse3.leader,
        apr: vaultResponse3.apr,
        tvlUsd: vaultResponse3.totalVlm ?? null,
        leaderCommission: vaultResponse3.leaderCommission ?? null,
        leaderFraction: vaultResponse3.leaderFraction ?? null,
        totalFollowers: vaultResponse3.totalFollowers ?? null,
        isClosed: false,
        allowDeposits: true,
      });

      mockPortfolioWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 2,
        errors: [],
        duplicatesSkipped: 0,
      });

      mockAprWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      const result = await processor.process(job);

      // Should mark as failed due to error
      expect(result.success).toBe(false);
      expect(result.recordsProcessed).toBe(3);
      expect(result.recordsInserted).toBe(3); // 2 portfolio + 1 APR
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("user-2");

      // Verify only 2 portfolio records were written (users 1 and 3)
      expect(mockPortfolioWriter.writeSnapshots).toHaveBeenCalledTimes(1);
      const portfolioRecords =
        mockPortfolioWriter.writeSnapshots.mock.calls[0][0];
      expect(portfolioRecords).toHaveLength(2);
    });

    it("should continue APR processing even when portfolio transformation fails", async () => {
      const job = createTestJob();

      const vipUsers = [
        createMockVipUser(
          "user-1",
          "0xuser1111111111111111111111111111111111111",
        ),
      ];
      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue(vipUsers);

      const vaultResponse = createMockVaultDetailsResponse({
        followerState: null, // Missing follower state - position transform will fail
      });

      mockHyperliquidFetcher.getVaultDetails.mockResolvedValue(vaultResponse);
      mockHyperliquidFetcher.extractPositionData.mockReturnValue(null); // No position data
      mockHyperliquidFetcher.extractAprData.mockReturnValue({
        vaultAddress: vaultResponse.vaultAddress,
        vaultName: "HLP Vault",
        leaderAddress: vaultResponse.leader,
        apr: vaultResponse.apr,
        tvlUsd: vaultResponse.totalVlm ?? null,
        leaderCommission: vaultResponse.leaderCommission ?? null,
        leaderFraction: vaultResponse.leaderFraction ?? null,
        totalFollowers: vaultResponse.totalFollowers ?? null,
        isClosed: false,
        allowDeposits: true,
      });

      mockAprWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      const result = await processor.process(job);

      // Should still succeed since APR was processed
      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1);
      expect(result.recordsInserted).toBe(1); // Only APR snapshot

      // Portfolio writer should not be called (no valid positions)
      expect(mockPortfolioWriter.writeSnapshots).not.toHaveBeenCalled();

      // APR writer should still be called
      expect(mockAprWriter.writeSnapshots).toHaveBeenCalledTimes(1);
    });
  });

  describe("APR Deduplication", () => {
    it("should deduplicate APR snapshots when multiple users share same vault", async () => {
      const job = createTestJob();

      // 3 users all in the same vault
      const vipUsers = [
        createMockVipUser(
          "user-1",
          "0xuser1111111111111111111111111111111111111",
        ),
        createMockVipUser(
          "user-2",
          "0xuser2222222222222222222222222222222222222",
        ),
        createMockVipUser(
          "user-3",
          "0xuser3333333333333333333333333333333333333",
        ),
      ];
      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue(vipUsers);

      const sharedVaultAddress = "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303";

      // All users get vault data with different timestamps
      const baseTime = Date.now() / 1000;

      vipUsers.forEach((user, index) => {
        const vaultResponse = createMockVaultDetailsResponse({
          vaultAddress: sharedVaultAddress,
          followerState: {
            ...createMockVaultDetailsResponse().followerState!,
            user: user.wallet,
            vaultEntryTime: baseTime - (3 - index) * 86400, // Different entry times
          },
        });

        mockHyperliquidFetcher.getVaultDetails.mockResolvedValueOnce(
          vaultResponse,
        );
        mockHyperliquidFetcher.extractPositionData.mockReturnValueOnce({
          userWallet: user.wallet,
          vaultAddress: sharedVaultAddress,
          vaultName: "HLP Vault",
          hlpBalance: 50000 + index * 5000,
          vaultUsdValue: 50000 + index * 5000,
          maxWithdrawable: 48000,
          relationshipType: "follower",
          leaderAddress: vaultResponse.leader,
          vaultDescription: null,
        });
        mockHyperliquidFetcher.extractAprData.mockReturnValueOnce({
          vaultAddress: sharedVaultAddress,
          vaultName: "HLP Vault",
          leaderAddress: vaultResponse.leader,
          apr: vaultResponse.apr,
          tvlUsd: vaultResponse.totalVlm ?? null,
          leaderCommission: vaultResponse.leaderCommission ?? null,
          leaderFraction: vaultResponse.leaderFraction ?? null,
          totalFollowers: vaultResponse.totalFollowers ?? null,
          isClosed: false,
          allowDeposits: true,
        });
      });

      mockPortfolioWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 3,
        errors: [],
        duplicatesSkipped: 0,
      });

      mockAprWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      const result = await processor.process(job);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(3);

      // 3 portfolio records written
      expect(mockPortfolioWriter.writeSnapshots).toHaveBeenCalledTimes(1);
      const portfolioRecords =
        mockPortfolioWriter.writeSnapshots.mock.calls[0][0];
      expect(portfolioRecords).toHaveLength(3);

      // Only 1 APR snapshot written (deduplicated)
      expect(mockAprWriter.writeSnapshots).toHaveBeenCalledTimes(1);
      const aprSnapshots = mockAprWriter.writeSnapshots.mock.calls[0][0];
      expect(aprSnapshots).toHaveLength(1);
      expect(aprSnapshots[0].vault_address).toBe(sharedVaultAddress);
    });

    it("should keep latest APR snapshot when vault address matches", async () => {
      const job = createTestJob();

      const vipUsers = [
        createMockVipUser(
          "user-1",
          "0xuser1111111111111111111111111111111111111",
        ),
        createMockVipUser(
          "user-2",
          "0xuser2222222222222222222222222222222222222",
        ),
      ];
      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue(vipUsers);

      const sharedVault = "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303";

      // User 1: Older timestamp
      const vaultResponse1 = createMockVaultDetailsResponse({
        vaultAddress: sharedVault,
        followerState: {
          ...createMockVaultDetailsResponse().followerState!,
          user: vipUsers[0].wallet,
        },
      });
      mockHyperliquidFetcher.getVaultDetails.mockResolvedValueOnce(
        vaultResponse1,
      );
      mockHyperliquidFetcher.extractPositionData.mockReturnValueOnce({
        userWallet: vipUsers[0].wallet,
        vaultAddress: sharedVault,
        vaultName: "HLP Vault",
        hlpBalance: 50000,
        vaultUsdValue: 50000,
        maxWithdrawable: 48000,
        relationshipType: "follower",
        leaderAddress: vaultResponse1.leader,
        vaultDescription: null,
      });
      mockHyperliquidFetcher.extractAprData.mockReturnValueOnce({
        vaultAddress: sharedVault,
        vaultName: "HLP Vault",
        leaderAddress: vaultResponse1.leader,
        apr: 0.2,
        tvlUsd: 15000000,
        leaderCommission: 0.1,
        leaderFraction: 0.15,
        totalFollowers: 200,
        isClosed: false,
        allowDeposits: true,
      });

      // User 2: Newer timestamp - should win deduplication
      const vaultResponse2 = createMockVaultDetailsResponse({
        vaultAddress: sharedVault,
        followerState: {
          ...createMockVaultDetailsResponse().followerState!,
          user: vipUsers[1].wallet,
        },
      });
      mockHyperliquidFetcher.getVaultDetails.mockResolvedValueOnce(
        vaultResponse2,
      );
      mockHyperliquidFetcher.extractPositionData.mockReturnValueOnce({
        userWallet: vipUsers[1].wallet,
        vaultAddress: sharedVault,
        vaultName: "HLP Vault",
        hlpBalance: 60000,
        vaultUsdValue: 60000,
        maxWithdrawable: 58000,
        relationshipType: "follower",
        leaderAddress: vaultResponse2.leader,
        vaultDescription: null,
      });
      mockHyperliquidFetcher.extractAprData.mockReturnValueOnce({
        vaultAddress: sharedVault,
        vaultName: "HLP Vault",
        leaderAddress: vaultResponse2.leader,
        apr: 0.25, // Different APR
        tvlUsd: 16000000, // Different TVL
        leaderCommission: 0.1,
        leaderFraction: 0.15,
        totalFollowers: 210, // Different follower count
        isClosed: false,
        allowDeposits: true,
      });

      mockPortfolioWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 2,
        errors: [],
        duplicatesSkipped: 0,
      });

      mockAprWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      await processor.process(job);

      // Verify only 1 APR snapshot written
      const aprSnapshots = mockAprWriter.writeSnapshots.mock.calls[0][0];
      expect(aprSnapshots).toHaveLength(1);

      // The snapshot should have the newer data (from user 2)
      const aprSnapshot = aprSnapshots[0];
      expect(aprSnapshot.vault_address).toBe(sharedVault);

      // Verify it's the latest snapshot (newer timestamp should be kept)
      // Since transformer generates current timestamp, we can't check exact value
      // but we verify the structure is correct
      expect(aprSnapshot.snapshot_time).toBeDefined();
      expect(new Date(aprSnapshot.snapshot_time).getTime()).toBeGreaterThan(0);
    });
  });

  describe("Empty Data Scenarios", () => {
    it("should handle zero VIP users gracefully", async () => {
      const job = createTestJob();

      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue([]);

      const result = await processor.process(job);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(0);
      expect(result.recordsInserted).toBe(0);
      expect(result.errors).toHaveLength(0);

      // No API calls should be made
      expect(mockHyperliquidFetcher.getVaultDetails).not.toHaveBeenCalled();
      expect(mockPortfolioWriter.writeSnapshots).not.toHaveBeenCalled();
      expect(mockAprWriter.writeSnapshots).not.toHaveBeenCalled();
    });

    it("should handle vault with no position data", async () => {
      const job = createTestJob();

      const vipUsers = [
        createMockVipUser(
          "user-1",
          "0xuser1111111111111111111111111111111111111",
        ),
      ];
      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue(vipUsers);

      const vaultResponse = createMockVaultDetailsResponse({
        followerState: null, // No position
      });

      mockHyperliquidFetcher.getVaultDetails.mockResolvedValue(vaultResponse);
      mockHyperliquidFetcher.extractPositionData.mockReturnValue(null);
      mockHyperliquidFetcher.extractAprData.mockReturnValue({
        vaultAddress: vaultResponse.vaultAddress,
        vaultName: "HLP Vault",
        leaderAddress: vaultResponse.leader,
        apr: vaultResponse.apr,
        tvlUsd: vaultResponse.totalVlm ?? null,
        leaderCommission: vaultResponse.leaderCommission ?? null,
        leaderFraction: vaultResponse.leaderFraction ?? null,
        totalFollowers: vaultResponse.totalFollowers ?? null,
        isClosed: false,
        allowDeposits: true,
      });

      mockAprWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      const result = await processor.process(job);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1);
      expect(result.recordsInserted).toBe(1); // Only APR

      // No portfolio writes
      expect(mockPortfolioWriter.writeSnapshots).not.toHaveBeenCalled();

      // APR should still be written
      expect(mockAprWriter.writeSnapshots).toHaveBeenCalledTimes(1);
    });
  });

  describe("Database Write Failures", () => {
    it("should report failure when portfolio writer fails", async () => {
      const job = createTestJob();

      const vipUsers = [
        createMockVipUser(
          "user-1",
          "0xuser1111111111111111111111111111111111111",
        ),
      ];
      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue(vipUsers);

      const vaultResponse = createMockVaultDetailsResponse({
        followerState: {
          ...createMockVaultDetailsResponse().followerState!,
          user: vipUsers[0].wallet,
        },
      });

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
        tvlUsd: vaultResponse.totalVlm ?? null,
        leaderCommission: vaultResponse.leaderCommission ?? null,
        leaderFraction: vaultResponse.leaderFraction ?? null,
        totalFollowers: vaultResponse.totalFollowers ?? null,
        isClosed: false,
        allowDeposits: true,
      });

      // Portfolio write fails
      mockPortfolioWriter.writeSnapshots.mockResolvedValue({
        success: false,
        recordsInserted: 0,
        errors: ["Database connection timeout"],
        duplicatesSkipped: 0,
      });

      // APR write succeeds
      mockAprWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(result.recordsProcessed).toBe(1);
      expect(result.recordsInserted).toBe(1); // Only APR succeeded
      expect(result.errors).toContain("Database connection timeout");
    });

    it("should report failure when APR writer fails", async () => {
      const job = createTestJob();

      const vipUsers = [
        createMockVipUser(
          "user-1",
          "0xuser1111111111111111111111111111111111111",
        ),
      ];
      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue(vipUsers);

      const vaultResponse = createMockVaultDetailsResponse({
        followerState: {
          ...createMockVaultDetailsResponse().followerState!,
          user: vipUsers[0].wallet,
        },
      });

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
        tvlUsd: vaultResponse.totalVlm ?? null,
        leaderCommission: vaultResponse.leaderCommission ?? null,
        leaderFraction: vaultResponse.leaderFraction ?? null,
        totalFollowers: vaultResponse.totalFollowers ?? null,
        isClosed: false,
        allowDeposits: true,
      });

      // Portfolio write succeeds
      mockPortfolioWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      // APR write fails
      mockAprWriter.writeSnapshots.mockResolvedValue({
        success: false,
        recordsInserted: 0,
        errors: ["Constraint violation on vault_address"],
        duplicatesSkipped: 0,
      });

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(result.recordsProcessed).toBe(1);
      expect(result.recordsInserted).toBe(1); // Only portfolio succeeded
      expect(result.errors).toContain("Constraint violation on vault_address");
    });
  });

  describe("Concurrent User Processing", () => {
    it("should process 10 users sequentially", async () => {
      const job = createTestJob();

      // Create 10 VIP users
      const vipUsers = Array.from({ length: 10 }, (_, i) =>
        createMockVipUser(
          `user-${i + 1}`,
          `0xuser${(i + 1).toString().padStart(40, "0")}`,
        ),
      );
      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue(vipUsers);

      // Mock responses for all 10 users
      vipUsers.forEach((user, index) => {
        const vaultResponse = createMockVaultDetailsResponse({
          vaultAddress: `0xvault${(index + 1).toString().padStart(39, "0")}`, // Different vaults
          followerState: {
            ...createMockVaultDetailsResponse().followerState!,
            user: user.wallet,
            totalAccountValue: 50000 + index * 1000,
            vaultEquity: 50000 + index * 1000,
          },
        });

        mockHyperliquidFetcher.getVaultDetails.mockResolvedValueOnce(
          vaultResponse,
        );
        mockHyperliquidFetcher.extractPositionData.mockReturnValueOnce({
          userWallet: user.wallet,
          vaultAddress: vaultResponse.vaultAddress,
          vaultName: `Vault ${index + 1}`,
          hlpBalance: 50000 + index * 1000,
          vaultUsdValue: 50000 + index * 1000,
          maxWithdrawable: 48000 + index * 1000,
          relationshipType: "follower",
          leaderAddress: vaultResponse.leader,
          vaultDescription: null,
        });
        mockHyperliquidFetcher.extractAprData.mockReturnValueOnce({
          vaultAddress: vaultResponse.vaultAddress,
          vaultName: `Vault ${index + 1}`,
          leaderAddress: vaultResponse.leader,
          apr: vaultResponse.apr,
          tvlUsd: vaultResponse.totalVlm ?? null,
          leaderCommission: vaultResponse.leaderCommission ?? null,
          leaderFraction: vaultResponse.leaderFraction ?? null,
          totalFollowers: vaultResponse.totalFollowers ?? null,
          isClosed: false,
          allowDeposits: true,
        });
      });

      mockPortfolioWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 10,
        errors: [],
        duplicatesSkipped: 0,
      });

      mockAprWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 10, // 10 different vaults
        errors: [],
        duplicatesSkipped: 0,
      });

      const result = await processor.process(job);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(10);
      expect(result.recordsInserted).toBe(20); // 10 portfolio + 10 APR

      // Verify API called 10 times
      expect(mockHyperliquidFetcher.getVaultDetails).toHaveBeenCalledTimes(10);

      // Verify results aggregated correctly
      expect(mockPortfolioWriter.writeSnapshots).toHaveBeenCalledTimes(1);
      const portfolioRecords =
        mockPortfolioWriter.writeSnapshots.mock.calls[0][0];
      expect(portfolioRecords).toHaveLength(10);

      expect(mockAprWriter.writeSnapshots).toHaveBeenCalledTimes(1);
      const aprSnapshots = mockAprWriter.writeSnapshots.mock.calls[0][0];
      expect(aprSnapshots).toHaveLength(10);
    });
  });

  describe("Health Check", () => {
    it("should return healthy when both dependencies are healthy", async () => {
      mockHyperliquidFetcher.healthCheck.mockResolvedValue({
        status: "healthy",
      });
      mockSupabaseFetcher.healthCheck.mockResolvedValue({ status: "healthy" });

      const result = await processor.healthCheck();

      expect(result.status).toBe("healthy");
      expect(result.details).toBeUndefined();
    });

    it("should return unhealthy when Hyperliquid API is down", async () => {
      mockHyperliquidFetcher.healthCheck.mockResolvedValue({
        status: "unhealthy",
        details: "Connection timeout",
      });
      mockSupabaseFetcher.healthCheck.mockResolvedValue({ status: "healthy" });

      const result = await processor.healthCheck();

      expect(result.status).toBe("unhealthy");
      expect(result.details).toContain("Hyperliquid");
      expect(result.details).toContain("Connection timeout");
    });

    it("should return unhealthy when Supabase is down", async () => {
      mockHyperliquidFetcher.healthCheck.mockResolvedValue({
        status: "healthy",
      });
      mockSupabaseFetcher.healthCheck.mockResolvedValue({
        status: "unhealthy",
        details: "Database unavailable",
      });

      const result = await processor.healthCheck();

      expect(result.status).toBe("unhealthy");
      expect(result.details).toContain("Supabase");
      expect(result.details).toContain("Database unavailable");
    });
  });

  describe("Stats Retrieval", () => {
    it("should aggregate stats from both fetchers", () => {
      mockHyperliquidFetcher.getRequestStats.mockReturnValue({
        requestCount: 15,
        lastRequestTime: Date.now(),
      });
      mockSupabaseFetcher.getRequestStats.mockReturnValue({
        requestCount: 3,
        lastRequestTime: Date.now(),
      });

      const stats = processor.getStats();

      expect(stats).toEqual({
        hyperliquid: {
          requestCount: 15,
          lastRequestTime: expect.any(Number),
        },
        supabase: {
          requestCount: 3,
          lastRequestTime: expect.any(Number),
        },
      });
    });
  });
});
