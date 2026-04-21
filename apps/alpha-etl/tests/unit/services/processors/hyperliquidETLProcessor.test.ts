/**
 * Comprehensive unit tests for HyperliquidVaultETLProcessor
 * Tests orchestration logic, APR deduplication, error handling, and data flow
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  ETLJob,
  VipUserWithActivity,
} from "../../../../src/types/index.js";
import type {
  VaultPositionData,
  VaultAprData,
  VaultDetailsResponse,
} from "../../../../src/modules/hyperliquid/fetcher.js";
import type {
  PortfolioItemSnapshotInsert,
  HyperliquidVaultAprSnapshotInsert,
} from "../../../../src/types/database.js";
import type { HyperliquidVaultETLProcessor } from "../../../../src/modules/hyperliquid/processor.js";

// Hoisted mocks for proper timing
const {
  mockLogger,
  mockHyperliquidFetcher,
  mockSupabaseFetcher,
  mockTransformer,
  mockAprWriter,
  mockPortfolioWriter,
} = vi.hoisted(() => {
  const fetchVipUsers = vi.fn();

  return {
    mockLogger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
    mockHyperliquidFetcher: {
      getVaultDetails: vi.fn(),
      extractPositionData: vi.fn(),
      extractAprData: vi.fn(),
      healthCheck: vi.fn(),
      getRequestStats: vi.fn(),
    },
    mockSupabaseFetcher: {
      fetchVipUsers,
      fetchVipUsersWithActivity: fetchVipUsers,
      batchUpdatePortfolioTimestamps: vi.fn(),
      healthCheck: vi.fn(),
      getRequestStats: vi.fn(),
    },
    mockTransformer: {
      transformPosition: vi.fn(),
      transformApr: vi.fn(),
    },
    mockAprWriter: {
      writeSnapshots: vi.fn(),
    },
    mockPortfolioWriter: {
      writeSnapshots: vi.fn(),
    },
  };
});

// Mock all dependencies
vi.mock("../../../../src/utils/logger.js", () => ({
  logger: mockLogger,
}));

vi.mock("../../../../src/utils/mask.js", () => ({
  maskWalletAddress: vi.fn(
    (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`,
  ),
}));

vi.mock("../../../../src/modules/hyperliquid/fetcher.js", () => ({
  HyperliquidFetcher: class MockHyperliquidFetcher {
    constructor() {
      return mockHyperliquidFetcher;
    }
  },
}));

vi.mock("../../../../src/modules/vip-users/supabaseFetcher.js", () => ({
  SupabaseFetcher: class MockSupabaseFetcher {
    constructor() {
      return mockSupabaseFetcher;
    }
  },
}));

vi.mock("../../../../src/modules/hyperliquid/transformer.js", () => ({
  HyperliquidDataTransformer: class MockTransformer {
    constructor() {
      return mockTransformer;
    }
  },
}));

vi.mock("../../../../src/modules/hyperliquid/aprWriter.js", () => ({
  HyperliquidVaultAprWriter: class MockAprWriter {
    constructor() {
      return mockAprWriter;
    }
  },
}));

vi.mock("../../../../src/modules/wallet/portfolioWriter.js", () => ({
  PortfolioItemWriter: class MockPortfolioWriter {
    constructor() {
      return mockPortfolioWriter;
    }
  },
}));

// Test data factory functions
function createMockJob(overrides: Partial<ETLJob> = {}): ETLJob {
  return {
    jobId: "test-job-123",
    trigger: "scheduled",
    sources: ["hyperliquid"],
    filters: {},
    createdAt: new Date("2025-02-01T12:00:00Z"),
    status: "pending",
    ...overrides,
  };
}

function createMockVipUser(
  userId: string,
  wallet: string,
): VipUserWithActivity {
  return {
    user_id: userId,
    wallet,
    last_activity_at: null, // Never had activity - will always update
    last_portfolio_update_at: null, // Never updated - will always update
  };
}

const createMockVaultDetails = (
  vaultAddress: string,
  apr: number = 1.5,
  timestamp?: Date,
): VaultDetailsResponse => ({
  vault: "hlp",
  vaultAddress,
  leader: "0xleader123",
  name: `Vault ${vaultAddress}`,
  description: "Test vault",
  apr,
  totalVlm: 1_000_000,
  leaderCommission: 0.1,
  leaderFraction: 0.2,
  isClosed: false,
  allowDeposits: true,
  followerState: {
    user: "0xwallet",
    vaultAddress,
    totalAccountValue: "100",
    maxWithdrawable: "10",
    maxDistributable: undefined,
  },
  relationship: {
    type: "follower",
    data: { since: timestamp?.toISOString() ?? "2024-01-01" },
  },
  portfolio: [],
  allTime: {},
  totalFollowers: 5,
});

function createMockPositionData(
  wallet: string,
  vaultAddress: string,
): VaultPositionData {
  return {
    userWallet: wallet,
    vaultAddress,
    vaultName: `Vault ${vaultAddress}`,
    hlpBalance: 100,
    vaultUsdValue: 100,
    maxWithdrawable: 10,
    relationshipType: "follower",
    leaderAddress: "0xleader123",
    vaultDescription: "Test vault",
  };
}

const createMockAprData = (
  vaultAddress: string,
  apr: number = 1.5,
): VaultAprData => ({
  vaultAddress,
  vaultName: `Vault ${vaultAddress}`,
  leaderAddress: "0xleader123",
  apr,
  tvlUsd: 1_000_000,
  leaderCommission: 0.1,
  leaderFraction: 0.2,
  totalFollowers: 5,
  isClosed: false,
  allowDeposits: true,
});

// NOTE: some callers pass (label, vaultAddress) — the first arg is always the vaultAddress key.
// The second arg is accepted for call-site compatibility but not used in snapshot content.
const createMockPortfolioSnapshot = (
  userId: string,
  vaultAddress: string,
): PortfolioItemSnapshotInsert => ({
  wallet:
    userId === "user-1"
      ? "0xwallet1"
      : userId === "user-2"
        ? "0xwallet2"
        : userId === "user-3"
          ? "0xwallet3"
          : userId === "u1"
            ? "0xwallet1"
            : "0xwallet",
  chain: "hyperliquid",
  name: "hyperliquid",
  name_item: `Vault ${vaultAddress}`,
  id_raw: vaultAddress,
  asset_usd_value: 100,
  detail: {
    vault_address: vaultAddress,
    hlp_balance: 100,
    relationship_type: "follower",
    max_withdrawable: 10,
    description: "Test vault",
  },
  snapshot_at: "2025-02-01T12:00:00.000Z",
  has_supported_portfolio: true,
  site_url: `https://app.hyperliquid.xyz/vaults/${vaultAddress}`,
  asset_dict: { [vaultAddress]: 100 },
  asset_token_list: [],
  detail_types: ["hyperliquid"],
  pool: {
    id: vaultAddress,
    chain: "hyperliquid",
    index: null,
    time_at: 1738411200,
    adapter_id: "hyperliquid_vault",
    controller: "0xleader123",
    project_id: "hyperliquid",
  },
  proxy_detail: {},
  debt_usd_value: 0,
  net_usd_value: 100,
  update_at: 1738411200,
});

const createMockAprSnapshot = (
  vaultAddress: string,
  snapshotTime: string,
): HyperliquidVaultAprSnapshotInsert => ({
  source: "hyperliquid",
  vault_address: vaultAddress,
  vault_name: `Vault ${vaultAddress}`,
  leader_address: "0xleader123",
  apr: 1.5,
  apr_base: 1.3,
  apr_reward: 0.2,
  tvl_usd: 1_000_000,
  total_followers: 5,
  leader_commission: 0.1,
  leader_fraction: 0.2,
  is_closed: false,
  allow_deposits: true,
  pool_meta: {},
  raw_data: {},
  snapshot_time: snapshotTime,
});

describe("HyperliquidVaultETLProcessor", () => {
  let processor: HyperliquidVaultETLProcessor;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { HyperliquidVaultETLProcessor } =
      await import("../../../../src/modules/hyperliquid/processor.js");
    processor = new HyperliquidVaultETLProcessor();
  });

  describe("Constructor and Initialization", () => {
    it("should initialize all dependencies", () => {
      expect(processor.hyperliquidFetcher).toBe(mockHyperliquidFetcher);
      expect(processor.supabaseFetcher).toBe(mockSupabaseFetcher);
      expect(processor.transformer).toBe(mockTransformer);
      expect(processor.aprWriter).toBe(mockAprWriter);
      expect(processor.portfolioWriter).toBe(mockPortfolioWriter);
    });

    it("should return correct source type", () => {
      expect(processor.getSourceType()).toBe("hyperliquid");
    });
  });

  describe("validation and write helpers", () => {
    it("returns a failed process result when the job is invalid", async () => {
      const result = await processor.process({ trigger: "manual" } as ETLJob);

      expect(result.success).toBe(false);
      expect(result.recordsInserted).toBe(0);
      expect(result.source).toBe("hyperliquid");
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("returns an empty write result when there is no transformed batch", async () => {
      const result = await (
        processor as unknown as {
          writeTransformedData: (
            batches: unknown[],
            jobId: string,
          ) => Promise<{
            success: boolean;
            recordsInserted: number;
            duplicatesSkipped: number;
            errors: string[];
          }>;
        }
      ).writeTransformedData([], "job-empty");

      expect(result).toEqual({
        success: true,
        recordsInserted: 0,
        duplicatesSkipped: 0,
        errors: [],
      });
    });

    it("treats missing duplicatesSkipped values as zero", async () => {
      mockPortfolioWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 2,
        duplicatesSkipped: undefined,
        errors: [],
      });
      mockAprWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        duplicatesSkipped: undefined,
        errors: [],
      });

      const result = await (
        processor as unknown as {
          writeTransformedData: (
            batches: Array<{
              portfolioRecords: PortfolioItemSnapshotInsert[];
              aprRecords: HyperliquidVaultAprSnapshotInsert[];
              successfulWallets: string[];
              errors: string[];
              success: boolean;
            }>,
            jobId: string,
          ) => Promise<{
            success: boolean;
            recordsInserted: number;
            duplicatesSkipped: number;
            errors: string[];
          }>;
        }
      ).writeTransformedData(
        [
          {
            portfolioRecords: [
              createMockPortfolioSnapshot("user-1", "0xvault1"),
            ],
            aprRecords: [
              createMockAprSnapshot("0xvault1", "2025-02-01T12:00:00.000Z"),
            ],
            successfulWallets: ["0xwallet1"],
            errors: [],
            success: true,
          },
        ],
        "job-duplicates",
      );

      expect(mockPortfolioWriter.writeSnapshots).toHaveBeenCalledOnce();
      expect(mockAprWriter.writeSnapshots).toHaveBeenCalledOnce();
      expect(result).toEqual({
        success: true,
        recordsInserted: 3,
        duplicatesSkipped: 0,
        errors: [],
      });
    });
  });

  describe("process() - Happy Path", () => {
    it("should successfully process single VIP user with complete data", async () => {
      const job = createMockJob();
      const vipUser = createMockVipUser("user-1", "0xwallet1");
      const vaultDetails = createMockVaultDetails("0xvault1");
      const positionData = createMockPositionData("0xwallet1", "0xvault1");
      const aprData = createMockAprData("0xvault1");
      const portfolioSnapshot = createMockPortfolioSnapshot(
        "user-1",
        "0xvault1",
      );
      const aprSnapshot = createMockAprSnapshot(
        "0xvault1",
        "2025-02-01T12:00:00.000Z",
      );

      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue([vipUser]);
      mockHyperliquidFetcher.getVaultDetails.mockResolvedValue(vaultDetails);
      mockHyperliquidFetcher.extractPositionData.mockReturnValue(positionData);
      mockHyperliquidFetcher.extractAprData.mockReturnValue(aprData);
      mockTransformer.transformPosition.mockReturnValue(portfolioSnapshot);
      mockTransformer.transformApr.mockReturnValue(aprSnapshot);
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

      const result = await processor.process(job);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1);
      expect(result.recordsInserted).toBe(2);
      expect(result.errors).toEqual([]);
      expect(result.source).toBe("hyperliquid");

      expect(mockSupabaseFetcher.fetchVipUsers).toHaveBeenCalledTimes(1);
      expect(mockHyperliquidFetcher.getVaultDetails).toHaveBeenCalledWith(
        "0xwallet1",
      );
      expect(mockHyperliquidFetcher.extractPositionData).toHaveBeenCalledWith(
        vaultDetails,
        "0xwallet1",
      );
      expect(mockHyperliquidFetcher.extractAprData).toHaveBeenCalledWith(
        vaultDetails,
      );
      expect(mockTransformer.transformPosition).toHaveBeenCalledWith({
        position: positionData,
        timestamp: expect.any(String),
      });
      expect(mockTransformer.transformApr).toHaveBeenCalledWith(
        aprData,
        vaultDetails,
      );
      expect(mockPortfolioWriter.writeSnapshots).toHaveBeenCalledWith([
        portfolioSnapshot,
      ]);
      expect(mockAprWriter.writeSnapshots).toHaveBeenCalledWith([aprSnapshot]);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Processing Hyperliquid vault data",
        { jobId: job.jobId },
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Hyperliquid processing completed",
        {
          jobId: job.jobId,
          usersProcessed: 1,
          positionsTransformed: 1,
          aprSnapshots: 1,
          success: true,
        },
      );
    });

    it("should successfully process multiple VIP users", async () => {
      const job = createMockJob();
      const vipUsers = [
        createMockVipUser("user-1", "0xwallet1"),
        createMockVipUser("user-2", "0xwallet2"),
        createMockVipUser("user-3", "0xwallet3"),
      ];

      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue(vipUsers);

      for (let i = 0; i < vipUsers.length; i++) {
        const vaultAddr = `0xvault${i + 1}`;
        const wallet = `0xwallet${i + 1}`;

        mockHyperliquidFetcher.getVaultDetails.mockResolvedValueOnce(
          createMockVaultDetails(vaultAddr),
        );
        mockHyperliquidFetcher.extractPositionData.mockReturnValueOnce(
          createMockPositionData(wallet, vaultAddr),
        );
        mockHyperliquidFetcher.extractAprData.mockReturnValueOnce(
          createMockAprData(vaultAddr),
        );
        mockTransformer.transformPosition.mockReturnValueOnce(
          createMockPortfolioSnapshot(vipUsers[i].user_id, vaultAddr),
        );
        mockTransformer.transformApr.mockReturnValueOnce(
          createMockAprSnapshot(vaultAddr, "2025-02-01T12:00:00.000Z"),
        );
      }

      mockPortfolioWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 3,
        errors: [],
        duplicatesSkipped: 0,
      });
      mockAprWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 3,
        errors: [],
        duplicatesSkipped: 0,
      });

      const result = await processor.process(job);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(3);
      expect(result.recordsInserted).toBe(6);
      expect(result.errors).toEqual([]);

      expect(mockHyperliquidFetcher.getVaultDetails).toHaveBeenCalledTimes(3);
      expect(mockPortfolioWriter.writeSnapshots).toHaveBeenCalledTimes(1);
      expect(mockAprWriter.writeSnapshots).toHaveBeenCalledTimes(1);
    });
  });

  describe("process() - Edge Cases", () => {
    it("should return early when no VIP users found", async () => {
      const job = createMockJob();
      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue([]);

      const result = await processor.process(job);

      expect(result).toEqual({
        success: true,
        recordsProcessed: 0,
        recordsInserted: 0,
        errors: [],
        source: "hyperliquid",
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "No VIP users returned for Hyperliquid processing",
        { jobId: job.jobId },
      );
      expect(mockHyperliquidFetcher.getVaultDetails).not.toHaveBeenCalled();
      expect(mockPortfolioWriter.writeSnapshots).not.toHaveBeenCalled();
      expect(mockAprWriter.writeSnapshots).not.toHaveBeenCalled();
    });

    it("should skip position when transformPosition returns null", async () => {
      const job = createMockJob();
      const vipUser = createMockVipUser("user-1", "0xwallet1");
      const vaultDetails = createMockVaultDetails("0xvault1");
      const positionData = createMockPositionData("0xwallet1", "0xvault1");
      const aprData = createMockAprData("0xvault1");
      const aprSnapshot = createMockAprSnapshot(
        "0xvault1",
        "2025-02-01T12:00:00.000Z",
      );

      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue([vipUser]);
      mockHyperliquidFetcher.getVaultDetails.mockResolvedValue(vaultDetails);
      mockHyperliquidFetcher.extractPositionData.mockReturnValue(positionData);
      mockHyperliquidFetcher.extractAprData.mockReturnValue(aprData);
      mockTransformer.transformPosition.mockReturnValue(null);
      mockTransformer.transformApr.mockReturnValue(aprSnapshot);
      mockAprWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      const result = await processor.process(job);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1);
      expect(result.recordsInserted).toBe(1);
      expect(mockPortfolioWriter.writeSnapshots).not.toHaveBeenCalled();
      expect(mockAprWriter.writeSnapshots).toHaveBeenCalledWith([aprSnapshot]);
    });

    it("should continue processing when transformApr throws error", async () => {
      const job = createMockJob();
      const vipUser = createMockVipUser("user-1", "0xwallet1");
      const vaultDetails = createMockVaultDetails("0xvault1");
      const positionData = createMockPositionData("0xwallet1", "0xvault1");
      const aprData = createMockAprData("0xvault1");
      const portfolioSnapshot = createMockPortfolioSnapshot(
        "user-1",
        "0xvault1",
      );

      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue([vipUser]);
      mockHyperliquidFetcher.getVaultDetails.mockResolvedValue(vaultDetails);
      mockHyperliquidFetcher.extractPositionData.mockReturnValue(positionData);
      mockHyperliquidFetcher.extractAprData.mockReturnValue(aprData);
      mockTransformer.transformPosition.mockReturnValue(portfolioSnapshot);
      mockTransformer.transformApr.mockImplementation(() => {
        throw new Error("APR transformation failed");
      });
      mockPortfolioWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(result.recordsProcessed).toBe(1);
      expect(result.recordsInserted).toBe(1);
      expect(result.errors).toEqual(["APR transformation failed"]);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Hyperliquid APR transformation failed",
        {
          jobId: job.jobId,
          vault: "0xvault1",
          error: "APR transformation failed",
        },
      );

      expect(mockPortfolioWriter.writeSnapshots).toHaveBeenCalledWith([
        portfolioSnapshot,
      ]);
      expect(mockAprWriter.writeSnapshots).not.toHaveBeenCalled();
    });

    it("should handle mixed success and failure across multiple users", async () => {
      const job = createMockJob();
      const vipUsers = [
        createMockVipUser("user-1", "0xwallet1"),
        createMockVipUser("user-2", "0xwallet2"),
        createMockVipUser("user-3", "0xwallet3"),
      ];

      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue(vipUsers);

      // User 1: Success
      mockHyperliquidFetcher.getVaultDetails.mockResolvedValueOnce(
        createMockVaultDetails("0xvault1"),
      );
      mockHyperliquidFetcher.extractPositionData.mockReturnValueOnce(
        createMockPositionData("0xwallet1", "0xvault1"),
      );
      mockHyperliquidFetcher.extractAprData.mockReturnValueOnce(
        createMockAprData("0xvault1"),
      );
      mockTransformer.transformPosition.mockReturnValueOnce(
        createMockPortfolioSnapshot("user-1", "0xvault1"),
      );
      mockTransformer.transformApr.mockReturnValueOnce(
        createMockAprSnapshot("0xvault1", "2025-02-01T12:00:00.000Z"),
      );

      // User 2: transformApr throws
      mockHyperliquidFetcher.getVaultDetails.mockResolvedValueOnce(
        createMockVaultDetails("0xvault2"),
      );
      mockHyperliquidFetcher.extractPositionData.mockReturnValueOnce(
        createMockPositionData("0xwallet2", "0xvault2"),
      );
      mockHyperliquidFetcher.extractAprData.mockReturnValueOnce(
        createMockAprData("0xvault2"),
      );
      mockTransformer.transformPosition.mockReturnValueOnce(
        createMockPortfolioSnapshot("user-2", "0xvault2"),
      );
      mockTransformer.transformApr.mockImplementationOnce(() => {
        throw new Error("APR error for user 2");
      });

      // User 3: getVaultDetails fails
      mockHyperliquidFetcher.getVaultDetails.mockRejectedValueOnce(
        new Error("API error for user 3"),
      );

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

      expect(result.success).toBe(false);
      expect(result.recordsProcessed).toBe(3);
      expect(result.recordsInserted).toBe(3);
      expect(result.errors).toEqual([
        "APR error for user 2",
        "API error for user 3",
      ]);

      expect(mockLogger.error).toHaveBeenCalledTimes(2);
    });
  });

  describe("APR Deduplication Logic (CRITICAL)", () => {
    it("should keep only the latest snapshot when multiple users share same vault address", async () => {
      const job = createMockJob();
      const vipUsers = [
        createMockVipUser("user-1", "0xwallet1"),
        createMockVipUser("user-2", "0xwallet2"),
      ];

      const sharedVault = "0xvault_shared";
      const olderTime = "2025-02-01T10:00:00.000Z";
      const newerTime = "2025-02-01T12:00:00.000Z";

      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue(vipUsers);

      // User 1: older timestamp
      mockHyperliquidFetcher.getVaultDetails.mockResolvedValueOnce(
        createMockVaultDetails(sharedVault),
      );
      mockHyperliquidFetcher.extractPositionData.mockReturnValueOnce(
        createMockPositionData("0xwallet1", sharedVault),
      );
      mockHyperliquidFetcher.extractAprData.mockReturnValueOnce(
        createMockAprData(sharedVault),
      );
      mockTransformer.transformPosition.mockReturnValueOnce(
        createMockPortfolioSnapshot("user-1", sharedVault),
      );
      mockTransformer.transformApr.mockReturnValueOnce(
        createMockAprSnapshot(sharedVault, olderTime),
      );

      // User 2: newer timestamp (should override)
      mockHyperliquidFetcher.getVaultDetails.mockResolvedValueOnce(
        createMockVaultDetails(sharedVault),
      );
      mockHyperliquidFetcher.extractPositionData.mockReturnValueOnce(
        createMockPositionData("0xwallet2", sharedVault),
      );
      mockHyperliquidFetcher.extractAprData.mockReturnValueOnce(
        createMockAprData(sharedVault),
      );
      mockTransformer.transformPosition.mockReturnValueOnce(
        createMockPortfolioSnapshot("user-2", sharedVault),
      );
      mockTransformer.transformApr.mockReturnValueOnce(
        createMockAprSnapshot(sharedVault, newerTime),
      );

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

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(2);

      // Verify only 1 APR snapshot written (the newer one)
      expect(mockAprWriter.writeSnapshots).toHaveBeenCalledTimes(1);
      const aprSnapshots = mockAprWriter.writeSnapshots.mock.calls[0][0];
      expect(aprSnapshots).toHaveLength(1);
      expect(aprSnapshots[0].vault_address).toBe(sharedVault);
      expect(aprSnapshots[0].snapshot_time).toBe(newerTime);
    });

    it("should discard older snapshots when newer one comes first", async () => {
      const job = createMockJob();
      const vipUsers = [
        createMockVipUser("user-1", "0xwallet1"),
        createMockVipUser("user-2", "0xwallet2"),
      ];

      const sharedVault = "0xvault_shared";
      const newerTime = "2025-02-01T12:00:00.000Z";
      const olderTime = "2025-02-01T10:00:00.000Z";

      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue(vipUsers);

      // User 1: newer timestamp
      mockHyperliquidFetcher.getVaultDetails.mockResolvedValueOnce(
        createMockVaultDetails(sharedVault),
      );
      mockHyperliquidFetcher.extractPositionData.mockReturnValueOnce(
        createMockPositionData("0xwallet1", sharedVault),
      );
      mockHyperliquidFetcher.extractAprData.mockReturnValueOnce(
        createMockAprData(sharedVault),
      );
      mockTransformer.transformPosition.mockReturnValueOnce(
        createMockPortfolioSnapshot("user-1", sharedVault),
      );
      mockTransformer.transformApr.mockReturnValueOnce(
        createMockAprSnapshot(sharedVault, newerTime),
      );

      // User 2: older timestamp (should be discarded)
      mockHyperliquidFetcher.getVaultDetails.mockResolvedValueOnce(
        createMockVaultDetails(sharedVault),
      );
      mockHyperliquidFetcher.extractPositionData.mockReturnValueOnce(
        createMockPositionData("0xwallet2", sharedVault),
      );
      mockHyperliquidFetcher.extractAprData.mockReturnValueOnce(
        createMockAprData(sharedVault),
      );
      mockTransformer.transformPosition.mockReturnValueOnce(
        createMockPortfolioSnapshot("user-2", sharedVault),
      );
      mockTransformer.transformApr.mockReturnValueOnce(
        createMockAprSnapshot(sharedVault, olderTime),
      );

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

      const aprSnapshots = mockAprWriter.writeSnapshots.mock.calls[0][0];
      expect(aprSnapshots).toHaveLength(1);
      expect(aprSnapshots[0].snapshot_time).toBe(newerTime);
    });

    it("should keep snapshots for different vault addresses", async () => {
      const job = createMockJob();
      const vipUsers = [
        createMockVipUser("user-1", "0xwallet1"),
        createMockVipUser("user-2", "0xwallet2"),
        createMockVipUser("user-3", "0xwallet3"),
      ];

      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue(vipUsers);

      const vault1 = "0xvault1";
      const vault2 = "0xvault2";
      const vault3 = "0xvault3";

      mockHyperliquidFetcher.getVaultDetails.mockResolvedValueOnce(
        createMockVaultDetails(vault1),
      );
      mockHyperliquidFetcher.extractPositionData.mockReturnValueOnce(
        createMockPositionData("0xwallet1", vault1),
      );
      mockHyperliquidFetcher.extractAprData.mockReturnValueOnce(
        createMockAprData(vault1),
      );
      mockTransformer.transformPosition.mockReturnValueOnce(
        createMockPortfolioSnapshot("user-1", vault1),
      );
      mockTransformer.transformApr.mockReturnValueOnce(
        createMockAprSnapshot(vault1, "2025-02-01T12:00:00.000Z"),
      );

      mockHyperliquidFetcher.getVaultDetails.mockResolvedValueOnce(
        createMockVaultDetails(vault2),
      );
      mockHyperliquidFetcher.extractPositionData.mockReturnValueOnce(
        createMockPositionData("0xwallet2", vault2),
      );
      mockHyperliquidFetcher.extractAprData.mockReturnValueOnce(
        createMockAprData(vault2),
      );
      mockTransformer.transformPosition.mockReturnValueOnce(
        createMockPortfolioSnapshot("user-2", vault2),
      );
      mockTransformer.transformApr.mockReturnValueOnce(
        createMockAprSnapshot(vault2, "2025-02-01T12:00:00.000Z"),
      );

      mockHyperliquidFetcher.getVaultDetails.mockResolvedValueOnce(
        createMockVaultDetails(vault3),
      );
      mockHyperliquidFetcher.extractPositionData.mockReturnValueOnce(
        createMockPositionData("0xwallet3", vault3),
      );
      mockHyperliquidFetcher.extractAprData.mockReturnValueOnce(
        createMockAprData(vault3),
      );
      mockTransformer.transformPosition.mockReturnValueOnce(
        createMockPortfolioSnapshot("user-3", vault3),
      );
      mockTransformer.transformApr.mockReturnValueOnce(
        createMockAprSnapshot(vault3, "2025-02-01T12:00:00.000Z"),
      );

      mockPortfolioWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 3,
        errors: [],
        duplicatesSkipped: 0,
      });
      mockAprWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 3,
        errors: [],
        duplicatesSkipped: 0,
      });

      await processor.process(job);

      const aprSnapshots = mockAprWriter.writeSnapshots.mock.calls[0][0];
      expect(aprSnapshots).toHaveLength(3);
      expect(aprSnapshots.map((s) => s.vault_address).sort()).toEqual(
        [vault1, vault2, vault3].sort(),
      );
    });
  });

  describe("Error Handling", () => {
    it("should throw and catch when fetchVipUsers fails", async () => {
      const job = createMockJob();
      const fetchError = new Error("Supabase connection failed");

      mockSupabaseFetcher.fetchVipUsers.mockRejectedValue(fetchError);

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(result.recordsProcessed).toBe(0);
      expect(result.recordsInserted).toBe(0);
      expect(result.errors).toEqual(["Supabase connection failed"]);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "hyperliquid processing failed:",
        {
          jobId: job.jobId,
          error: expect.any(Error),
        },
      );
    });

    it("should continue processing when getVaultDetails fails for one user", async () => {
      const job = createMockJob();
      const vipUsers = [
        createMockVipUser("user-1", "0xwallet1"),
        createMockVipUser("user-2", "0xwallet2"),
      ];

      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue(vipUsers);

      // User 1: fails
      mockHyperliquidFetcher.getVaultDetails.mockRejectedValueOnce(
        new Error("API timeout"),
      );

      // User 2: succeeds
      mockHyperliquidFetcher.getVaultDetails.mockResolvedValueOnce(
        createMockVaultDetails("0xvault2"),
      );
      mockHyperliquidFetcher.extractPositionData.mockReturnValueOnce(
        createMockPositionData("0xwallet2", "0xvault2"),
      );
      mockHyperliquidFetcher.extractAprData.mockReturnValueOnce(
        createMockAprData("0xvault2"),
      );
      mockTransformer.transformPosition.mockReturnValueOnce(
        createMockPortfolioSnapshot("user-2", "0xvault2"),
      );
      mockTransformer.transformApr.mockReturnValueOnce(
        createMockAprSnapshot("0xvault2", "2025-02-01T12:00:00.000Z"),
      );

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

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(result.recordsProcessed).toBe(2);
      expect(result.recordsInserted).toBe(2);
      expect(result.errors).toEqual(["API timeout"]);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to process Hyperliquid vault for user",
        {
          jobId: job.jobId,
          userId: "user-1",
          wallet: "0xwall...let1",
          error: "API timeout",
        },
      );
    });

    it("should mark success as false when portfolio writer fails", async () => {
      const job = createMockJob();
      const vipUser = createMockVipUser("user-1", "0xwallet1");
      const vaultDetails = createMockVaultDetails("0xvault1");
      const positionData = createMockPositionData("0xwallet1", "0xvault1");
      const aprData = createMockAprData("0xvault1");
      const portfolioSnapshot = createMockPortfolioSnapshot(
        "user-1",
        "0xvault1",
      );
      const aprSnapshot = createMockAprSnapshot(
        "0xvault1",
        "2025-02-01T12:00:00.000Z",
      );

      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue([vipUser]);
      mockHyperliquidFetcher.getVaultDetails.mockResolvedValue(vaultDetails);
      mockHyperliquidFetcher.extractPositionData.mockReturnValue(positionData);
      mockHyperliquidFetcher.extractAprData.mockReturnValue(aprData);
      mockTransformer.transformPosition.mockReturnValue(portfolioSnapshot);
      mockTransformer.transformApr.mockReturnValue(aprSnapshot);
      mockPortfolioWriter.writeSnapshots.mockResolvedValue({
        success: false,
        recordsInserted: 0,
        errors: ["Portfolio write error"],
        duplicatesSkipped: 0,
      });
      mockAprWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(result.recordsInserted).toBe(1);
      expect(result.errors).toEqual(["Portfolio write error"]);
    });

    it("should mark success as false when APR writer fails", async () => {
      const job = createMockJob();
      const vipUser = createMockVipUser("user-1", "0xwallet1");
      const vaultDetails = createMockVaultDetails("0xvault1");
      const positionData = createMockPositionData("0xwallet1", "0xvault1");
      const aprData = createMockAprData("0xvault1");
      const portfolioSnapshot = createMockPortfolioSnapshot(
        "user-1",
        "0xvault1",
      );
      const aprSnapshot = createMockAprSnapshot(
        "0xvault1",
        "2025-02-01T12:00:00.000Z",
      );

      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue([vipUser]);
      mockHyperliquidFetcher.getVaultDetails.mockResolvedValue(vaultDetails);
      mockHyperliquidFetcher.extractPositionData.mockReturnValue(positionData);
      mockHyperliquidFetcher.extractAprData.mockReturnValue(aprData);
      mockTransformer.transformPosition.mockReturnValue(portfolioSnapshot);
      mockTransformer.transformApr.mockReturnValue(aprSnapshot);
      mockPortfolioWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });
      mockAprWriter.writeSnapshots.mockResolvedValue({
        success: false,
        recordsInserted: 0,
        errors: ["APR write error"],
        duplicatesSkipped: 0,
      });

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(result.recordsInserted).toBe(1);
      expect(result.errors).toEqual(["APR write error"]);
    });

    it("should handle both writers failing simultaneously", async () => {
      const job = createMockJob();
      const vipUser = createMockVipUser("user-1", "0xwallet1");
      const vaultDetails = createMockVaultDetails("0xvault1");
      const positionData = createMockPositionData("0xwallet1", "0xvault1");
      const aprData = createMockAprData("0xvault1");
      const portfolioSnapshot = createMockPortfolioSnapshot(
        "user-1",
        "0xvault1",
      );
      const aprSnapshot = createMockAprSnapshot(
        "0xvault1",
        "2025-02-01T12:00:00.000Z",
      );

      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue([vipUser]);
      mockHyperliquidFetcher.getVaultDetails.mockResolvedValue(vaultDetails);
      mockHyperliquidFetcher.extractPositionData.mockReturnValue(positionData);
      mockHyperliquidFetcher.extractAprData.mockReturnValue(aprData);
      mockTransformer.transformPosition.mockReturnValue(portfolioSnapshot);
      mockTransformer.transformApr.mockReturnValue(aprSnapshot);
      mockPortfolioWriter.writeSnapshots.mockResolvedValue({
        success: false,
        recordsInserted: 0,
        errors: ["Portfolio DB error"],
        duplicatesSkipped: 0,
      });
      mockAprWriter.writeSnapshots.mockResolvedValue({
        success: false,
        recordsInserted: 0,
        errors: ["APR DB error"],
        duplicatesSkipped: 0,
      });

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(result.recordsInserted).toBe(0);
      expect(result.errors).toEqual(["Portfolio DB error", "APR DB error"]);
    });

    it("should handle non-Error exceptions", async () => {
      const job = createMockJob();
      mockSupabaseFetcher.fetchVipUsers.mockRejectedValue("String error");

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(["Unknown error"]);
    });
  });

  describe("Data Flow - Empty Scenarios", () => {
    it("should skip portfolio write when no position records", async () => {
      const job = createMockJob();
      const vipUser = createMockVipUser("user-1", "0xwallet1");
      const vaultDetails = createMockVaultDetails("0xvault1");
      const positionData = createMockPositionData("0xwallet1", "0xvault1");
      const aprData = createMockAprData("0xvault1");
      const aprSnapshot = createMockAprSnapshot(
        "0xvault1",
        "2025-02-01T12:00:00.000Z",
      );

      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue([vipUser]);
      mockHyperliquidFetcher.getVaultDetails.mockResolvedValue(vaultDetails);
      mockHyperliquidFetcher.extractPositionData.mockReturnValue(positionData);
      mockHyperliquidFetcher.extractAprData.mockReturnValue(aprData);
      mockTransformer.transformPosition.mockReturnValue(null);
      mockTransformer.transformApr.mockReturnValue(aprSnapshot);
      mockAprWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      const result = await processor.process(job);

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(1);
      expect(mockPortfolioWriter.writeSnapshots).not.toHaveBeenCalled();
      expect(mockAprWriter.writeSnapshots).toHaveBeenCalledWith([aprSnapshot]);
    });

    it("should skip APR write when no APR snapshots", async () => {
      const job = createMockJob();
      const vipUser = createMockVipUser("user-1", "0xwallet1");
      const vaultDetails = createMockVaultDetails("0xvault1");
      const positionData = createMockPositionData("0xwallet1", "0xvault1");
      const aprData = createMockAprData("0xvault1");
      const portfolioSnapshot = createMockPortfolioSnapshot(
        "user-1",
        "0xvault1",
      );

      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue([vipUser]);
      mockHyperliquidFetcher.getVaultDetails.mockResolvedValue(vaultDetails);
      mockHyperliquidFetcher.extractPositionData.mockReturnValue(positionData);
      mockHyperliquidFetcher.extractAprData.mockReturnValue(aprData);
      mockTransformer.transformPosition.mockReturnValue(portfolioSnapshot);
      mockTransformer.transformApr.mockImplementation(() => {
        throw new Error("APR error");
      });
      mockPortfolioWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(result.recordsInserted).toBe(1);
      expect(mockPortfolioWriter.writeSnapshots).toHaveBeenCalledWith([
        portfolioSnapshot,
      ]);
      expect(mockAprWriter.writeSnapshots).not.toHaveBeenCalled();
    });

    it("should complete successfully with no writes when both are empty", async () => {
      const job = createMockJob();
      const vipUser = createMockVipUser("user-1", "0xwallet1");
      const vaultDetails = createMockVaultDetails("0xvault1");
      const positionData = createMockPositionData("0xwallet1", "0xvault1");
      const aprData = createMockAprData("0xvault1");

      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue([vipUser]);
      mockHyperliquidFetcher.getVaultDetails.mockResolvedValue(vaultDetails);
      mockHyperliquidFetcher.extractPositionData.mockReturnValue(positionData);
      mockHyperliquidFetcher.extractAprData.mockReturnValue(aprData);
      mockTransformer.transformPosition.mockReturnValue(null);
      mockTransformer.transformApr.mockImplementation(() => {
        throw new Error("APR error");
      });

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(result.recordsProcessed).toBe(1);
      expect(result.recordsInserted).toBe(0);
      expect(mockPortfolioWriter.writeSnapshots).not.toHaveBeenCalled();
      expect(mockAprWriter.writeSnapshots).not.toHaveBeenCalled();
    });
  });

  describe("healthCheck()", () => {
    it("should return healthy when both fetchers are healthy", async () => {
      mockHyperliquidFetcher.healthCheck.mockResolvedValue({
        status: "healthy",
      });
      mockSupabaseFetcher.healthCheck.mockResolvedValue({ status: "healthy" });

      const result = await processor.healthCheck();

      expect(result).toEqual({ status: "healthy" });
      expect(mockHyperliquidFetcher.healthCheck).toHaveBeenCalledTimes(1);
      expect(mockSupabaseFetcher.healthCheck).toHaveBeenCalledTimes(1);
    });

    it("should return unhealthy when Hyperliquid is unhealthy", async () => {
      mockHyperliquidFetcher.healthCheck.mockResolvedValue({
        status: "unhealthy",
        details: "API unreachable",
      });
      mockSupabaseFetcher.healthCheck.mockResolvedValue({ status: "healthy" });

      const result = await processor.healthCheck();

      expect(result).toEqual({
        status: "unhealthy",
        details: "Hyperliquid: unhealthy (API unreachable), Supabase: healthy",
      });
    });

    it("should return unhealthy when Supabase is unhealthy", async () => {
      mockHyperliquidFetcher.healthCheck.mockResolvedValue({
        status: "healthy",
      });
      mockSupabaseFetcher.healthCheck.mockResolvedValue({
        status: "unhealthy",
        details: "Connection timeout",
      });

      const result = await processor.healthCheck();

      expect(result).toEqual({
        status: "unhealthy",
        details:
          "Hyperliquid: healthy, Supabase: unhealthy (Connection timeout)",
      });
    });

    it("should return unhealthy when both are unhealthy", async () => {
      mockHyperliquidFetcher.healthCheck.mockResolvedValue({
        status: "unhealthy",
        details: "API down",
      });
      mockSupabaseFetcher.healthCheck.mockResolvedValue({
        status: "unhealthy",
        details: "DB down",
      });

      const result = await processor.healthCheck();

      expect(result).toEqual({
        status: "unhealthy",
        details:
          "Hyperliquid: unhealthy (API down), Supabase: unhealthy (DB down)",
      });
    });

    it("should handle health check without details field", async () => {
      mockHyperliquidFetcher.healthCheck.mockResolvedValue({
        status: "unhealthy",
      });
      mockSupabaseFetcher.healthCheck.mockResolvedValue({ status: "healthy" });

      const result = await processor.healthCheck();

      expect(result).toEqual({
        status: "unhealthy",
        details: "Hyperliquid: unhealthy, Supabase: healthy",
      });
    });
  });

  describe("getStats()", () => {
    it("should return stats from both fetchers", () => {
      const hyperliquidStats = {
        requestsTotal: 100,
        requestsSuccessful: 95,
        lastRequestTime: Date.now(),
      };
      const supabaseStats = {
        requestsTotal: 50,
        requestsSuccessful: 48,
        vipUsersQueried: 10,
      };

      mockHyperliquidFetcher.getRequestStats.mockReturnValue(hyperliquidStats);
      mockSupabaseFetcher.getRequestStats.mockReturnValue(supabaseStats);

      const result = processor.getStats();

      expect(result).toEqual({
        hyperliquid: hyperliquidStats,
        supabase: supabaseStats,
      });

      expect(mockHyperliquidFetcher.getRequestStats).toHaveBeenCalledTimes(1);
      expect(mockSupabaseFetcher.getRequestStats).toHaveBeenCalledTimes(1);
    });

    it("should aggregate stats correctly with empty stats", () => {
      mockHyperliquidFetcher.getRequestStats.mockReturnValue({});
      mockSupabaseFetcher.getRequestStats.mockReturnValue({});

      const result = processor.getStats();

      expect(result).toEqual({
        hyperliquid: {},
        supabase: {},
      });
    });
  });

  describe("Logging Verification", () => {
    it("should log at all key processing points", async () => {
      const job = createMockJob();
      const vipUser = createMockVipUser("user-1", "0xwallet1");
      const vaultDetails = createMockVaultDetails("0xvault1");
      const positionData = createMockPositionData("0xwallet1", "0xvault1");
      const aprData = createMockAprData("0xvault1");
      const portfolioSnapshot = createMockPortfolioSnapshot(
        "user-1",
        "0xvault1",
      );
      const aprSnapshot = createMockAprSnapshot(
        "0xvault1",
        "2025-02-01T12:00:00.000Z",
      );

      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue([vipUser]);
      mockHyperliquidFetcher.getVaultDetails.mockResolvedValue(vaultDetails);
      mockHyperliquidFetcher.extractPositionData.mockReturnValue(positionData);
      mockHyperliquidFetcher.extractAprData.mockReturnValue(aprData);
      mockTransformer.transformPosition.mockReturnValue(portfolioSnapshot);
      mockTransformer.transformApr.mockReturnValue(aprSnapshot);
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

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Processing Hyperliquid vault data",
        { jobId: job.jobId },
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Hyperliquid processing completed",
        {
          jobId: job.jobId,
          usersProcessed: 1,
          positionsTransformed: 1,
          aprSnapshots: 1,
          success: true,
        },
      );
    });
  });

  describe("Activity-based filtering integration", () => {
    it("should skip inactive users with recent updates", async () => {
      // Mock user: inactive (10 days) but updated 3 days ago
      const inactiveUser = createMockVipUser("inactive-user", "0xINACTIVE");
      inactiveUser.last_activity_at = new Date(
        Date.now() - 10 * 24 * 60 * 60 * 1000,
      ).toISOString();
      inactiveUser.last_portfolio_update_at = new Date(
        Date.now() - 3 * 24 * 60 * 60 * 1000,
      ).toISOString();

      mockSupabaseFetcher.fetchVipUsersWithActivity.mockResolvedValue([
        inactiveUser,
      ]);

      await processor.process(createMockJob());

      // Verify Hyperliquid API was NOT called for this user
      expect(mockHyperliquidFetcher.getVaultDetails).not.toHaveBeenCalled();
    });

    it("should include active users in processing", async () => {
      const activeUser = createMockVipUser("active-user", "0xACTIVE");
      activeUser.last_activity_at = new Date(
        Date.now() - 2 * 24 * 60 * 60 * 1000,
      ).toISOString();
      activeUser.last_portfolio_update_at = new Date(
        Date.now() - 10 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const vaultDetails = createMockVaultDetails("0xvault1");
      const positionData = createMockPositionData("0xACTIVE", "0xvault1");
      const aprData = createMockAprData("0xvault1");

      mockSupabaseFetcher.fetchVipUsersWithActivity.mockResolvedValue([
        activeUser,
      ]);
      mockHyperliquidFetcher.getVaultDetails.mockResolvedValue(vaultDetails);
      mockHyperliquidFetcher.extractPositionData.mockReturnValue(positionData);
      mockHyperliquidFetcher.extractAprData.mockReturnValue(aprData);

      await processor.process(createMockJob());

      expect(mockHyperliquidFetcher.getVaultDetails).toHaveBeenCalledWith(
        "0xACTIVE",
      );
    });

    it("should update inactive users after 7+ days", async () => {
      const staleUser = createMockVipUser("stale-user", "0xSTALE");
      staleUser.last_activity_at = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000,
      ).toISOString();
      staleUser.last_portfolio_update_at = new Date(
        Date.now() - 8 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const vaultDetails = createMockVaultDetails("0xvault1");
      const positionData = createMockPositionData("0xSTALE", "0xvault1");
      const aprData = createMockAprData("0xvault1");

      mockSupabaseFetcher.fetchVipUsersWithActivity.mockResolvedValue([
        staleUser,
      ]);
      mockHyperliquidFetcher.getVaultDetails.mockResolvedValue(vaultDetails);
      mockHyperliquidFetcher.extractPositionData.mockReturnValue(positionData);
      mockHyperliquidFetcher.extractAprData.mockReturnValue(aprData);

      await processor.process(createMockJob());

      expect(mockHyperliquidFetcher.getVaultDetails).toHaveBeenCalledWith(
        "0xSTALE",
      );
    });

    it("should handle mixed user populations", async () => {
      const user1 = createMockVipUser(
        "u1",
        "0x1111111111111111111111111111111111111111",
      );
      user1.last_activity_at = new Date(
        Date.now() - 2 * 24 * 60 * 60 * 1000,
      ).toISOString();
      user1.last_portfolio_update_at = null;

      const user2 = createMockVipUser(
        "u2",
        "0x2222222222222222222222222222222222222222",
      );
      user2.last_activity_at = new Date(
        Date.now() - 10 * 24 * 60 * 60 * 1000,
      ).toISOString();
      user2.last_portfolio_update_at = new Date(
        Date.now() - 3 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const user3 = createMockVipUser(
        "u3",
        "0x3333333333333333333333333333333333333333",
      );
      user3.last_activity_at = new Date(
        Date.now() - 15 * 24 * 60 * 60 * 1000,
      ).toISOString();
      user3.last_portfolio_update_at = new Date(
        Date.now() - 8 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const vaultDetails = createMockVaultDetails("0xvault1");
      const positionData = createMockPositionData("0xwallet", "0xvault1");
      const aprData = createMockAprData("0xvault1");

      mockSupabaseFetcher.fetchVipUsersWithActivity.mockResolvedValue([
        user1,
        user2,
        user3,
      ]);
      mockHyperliquidFetcher.getVaultDetails.mockResolvedValue(vaultDetails);
      mockHyperliquidFetcher.extractPositionData.mockReturnValue(positionData);
      mockHyperliquidFetcher.extractAprData.mockReturnValue(aprData);

      await processor.process(createMockJob());

      // Should process 2 out of 3 users
      expect(mockHyperliquidFetcher.getVaultDetails).toHaveBeenCalledTimes(2);
      expect(mockHyperliquidFetcher.getVaultDetails).toHaveBeenCalledWith(
        "0x1111111111111111111111111111111111111111",
      );
      expect(mockHyperliquidFetcher.getVaultDetails).toHaveBeenCalledWith(
        "0x3333333333333333333333333333333333333333",
      );
      expect(mockHyperliquidFetcher.getVaultDetails).not.toHaveBeenCalledWith(
        "0x2222222222222222222222222222222222222222",
      );
    });

    it("should log correct cost savings stats", async () => {
      // 10 users: 3 to update, 7 to skip = 70% savings
      const users = Array.from({ length: 10 }, (_, i) => {
        const user = createMockVipUser(
          `user${i}`,
          `0x${i.toString().padStart(40, "0")}`,
        );
        user.last_activity_at = new Date(
          Date.now() - 10 * 24 * 60 * 60 * 1000,
        ).toISOString();
        user.last_portfolio_update_at =
          i < 3
            ? new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() // Stale → include
            : new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // Recent → skip
        return user;
      });

      const vaultDetails = createMockVaultDetails("0xvault1");
      const positionData = createMockPositionData("0xwallet", "0xvault1");
      const aprData = createMockAprData("0xvault1");

      mockSupabaseFetcher.fetchVipUsersWithActivity.mockResolvedValue(users);
      mockHyperliquidFetcher.getVaultDetails.mockResolvedValue(vaultDetails);
      mockHyperliquidFetcher.extractPositionData.mockReturnValue(positionData);
      mockHyperliquidFetcher.extractAprData.mockReturnValue(aprData);

      await processor.process(createMockJob());

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Users filtered by activity",
        expect.objectContaining({
          totalVipUsers: 10,
          usersToUpdate: 3,
          usersSkipped: 7,
          costSavingsPercent: "70%",
        }),
      );
    });
  });

  describe("Portfolio timestamp updates", () => {
    it("should call batchUpdatePortfolioTimestamps for successful wallets", async () => {
      const user1 = createMockVipUser(
        "u1",
        "0xWALLET1111111111111111111111111111111111",
      );
      const user2 = createMockVipUser(
        "u2",
        "0xWALLET2222222222222222222222222222222222",
      );

      const vaultDetails = createMockVaultDetails("0xvault1");
      const positionData = createMockPositionData("0xwallet", "0xvault1");
      const aprData = createMockAprData("0xvault1");

      mockSupabaseFetcher.fetchVipUsersWithActivity.mockResolvedValue([
        user1,
        user2,
      ]);
      mockHyperliquidFetcher.getVaultDetails.mockResolvedValue(vaultDetails);
      mockHyperliquidFetcher.extractPositionData.mockReturnValue(positionData);
      mockHyperliquidFetcher.extractAprData.mockReturnValue(aprData);

      await processor.process(createMockJob());

      expect(
        mockSupabaseFetcher.batchUpdatePortfolioTimestamps,
      ).toHaveBeenCalledWith([
        "0xWALLET1111111111111111111111111111111111",
        "0xWALLET2222222222222222222222222222222222",
      ]);
    });

    it("should handle timestamp update failure gracefully", async () => {
      const user1 = createMockVipUser(
        "u1",
        "0xWALLET1111111111111111111111111111111111",
      );

      const vaultDetails = createMockVaultDetails("0xvault1");
      const positionData = createMockPositionData(
        "0xWALLET1111111111111111111111111111111111",
        "0xvault1",
      );
      const aprData = createMockAprData("0xvault1");
      const portfolioSnapshot = createMockPortfolioSnapshot("u1", "0xvault1");
      const aprSnapshot = createMockAprSnapshot(
        "0xvault1",
        "2025-02-01T12:00:00.000Z",
      );

      mockSupabaseFetcher.fetchVipUsersWithActivity.mockResolvedValue([user1]);
      mockSupabaseFetcher.batchUpdatePortfolioTimestamps.mockRejectedValue(
        new Error("Timestamp update failed"),
      );
      mockHyperliquidFetcher.getVaultDetails.mockResolvedValue(vaultDetails);
      mockHyperliquidFetcher.extractPositionData.mockReturnValue(positionData);
      mockHyperliquidFetcher.extractAprData.mockReturnValue(aprData);
      mockTransformer.transformPosition.mockReturnValue(portfolioSnapshot);
      mockTransformer.transformApr.mockReturnValue(aprSnapshot);

      const result = await processor.process(createMockJob());

      // Should still succeed despite timestamp failure
      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBeGreaterThan(0);
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to batch update portfolio timestamps",
        expect.any(Object),
      );
    });

    it("should not call batchUpdatePortfolioTimestamps if no users processed", async () => {
      mockSupabaseFetcher.fetchVipUsersWithActivity.mockResolvedValue([]);

      await processor.process(createMockJob());

      expect(
        mockSupabaseFetcher.batchUpdatePortfolioTimestamps,
      ).not.toHaveBeenCalled();
    });
  });

  describe("Edge cases", () => {
    it("should handle all users being filtered out", async () => {
      const user = createMockVipUser(
        "u1",
        "0x1111111111111111111111111111111111111111",
      );
      user.last_activity_at = new Date(
        Date.now() - 10 * 24 * 60 * 60 * 1000,
      ).toISOString();
      user.last_portfolio_update_at = new Date(
        Date.now() - 1 * 24 * 60 * 60 * 1000,
      ).toISOString();

      mockSupabaseFetcher.fetchVipUsersWithActivity.mockResolvedValue([user]);

      const result = await processor.process(createMockJob());

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(0);
      expect(mockHyperliquidFetcher.getVaultDetails).not.toHaveBeenCalled();
    });

    it("should handle exactly 7-day boundary correctly", async () => {
      const exactlySevenDays = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const user = createMockVipUser(
        "boundary",
        "0xBOUNDARY1111111111111111111111111111111",
      );
      user.last_activity_at = exactlySevenDays.toISOString();
      user.last_portfolio_update_at = new Date(
        Date.now() - 2 * 24 * 60 * 60 * 1000,
      ).toISOString();

      // At exactly 7 days, user is considered inactive
      // Should be skipped (updated 2 days ago)
      mockSupabaseFetcher.fetchVipUsersWithActivity.mockResolvedValue([user]);

      await processor.process(createMockJob());

      expect(mockHyperliquidFetcher.getVaultDetails).not.toHaveBeenCalled();
    });
  });
});
