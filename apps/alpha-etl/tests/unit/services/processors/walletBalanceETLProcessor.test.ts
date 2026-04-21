/**
 * Unit tests for WalletBalanceETLProcessor
 * Simplified tests focusing on core functionality and coverage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WalletBalanceETLProcessor } from "../../../../src/modules/wallet/processor.js";
import type { ETLJob } from "../../../../src/types/index.js";

// Mock the logger to prevent console output during tests
const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../../../src/utils/logger.js", () => ({
  logger: mockLogger,
}));

// Mock the mask utility
vi.mock("../../../../src/utils/mask.js", () => ({
  maskWalletAddress: vi.fn(
    (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`,
  ),
}));

// Create simple mock implementations that always work
const mockDeBankFetcher = {
  fetchWalletTokenList: vi.fn().mockResolvedValue([
    {
      id: "0x1234567890123456789012345678901234567890",
      chain: "eth",
      name: "ethereum",
      symbol: "eth",
      amount: 5.25,
      price: 1800.5,
    },
  ]),
  fetchComplexProtocolList: vi.fn().mockResolvedValue([]),
  getRequestStats: vi.fn().mockReturnValue({
    requestCount: 0,
    lastRequestTime: 0,
  }),
  healthCheck: vi.fn().mockResolvedValue({ status: "healthy" }),
};

const fetchVipUsers = vi.fn().mockResolvedValue([
  {
    user_id: "user1",
    wallet: "0x1234567890123456789012345678901234567890",
    last_activity_at: null, // Never had activity - will always update
    last_portfolio_update_at: null, // Never updated - will always update
  },
]);

const mockSupabaseFetcher = {
  fetchVipUsers,
  fetchVipUsersWithActivity: fetchVipUsers,
  batchUpdatePortfolioTimestamps: vi.fn().mockResolvedValue(undefined),
  getRequestStats: vi.fn().mockReturnValue({
    requestCount: 0,
    lastRequestTime: 0,
  }),
  healthCheck: vi.fn().mockResolvedValue({ status: "healthy" }),
};

const mockTransformer = {
  transformBatch: vi.fn().mockImplementation((data) => {
    // Return the input data as-is for most tests (or empty if input is empty)
    if (data.length === 0) {
      return [];
    }
    // Default: return transformed data matching input
    return data.map((item) => ({
      user_wallet_address: item.user_wallet_address,
      token_address: item.token_address,
      chain: item.chain || "ethereum",
      symbol: item.symbol || "eth",
      amount: item.amount || 5.25,
    }));
  }),
};

const mockWriter = {
  writeWalletBalanceSnapshots: vi.fn().mockImplementation(async (data) => ({
    success: true,
    recordsInserted: data.length,
    errors: [],
    duplicatesSkipped: 0,
  })),
};

const mockPortfolioTransformer = {
  transformBatch: vi.fn().mockReturnValue([]),
};

const mockPortfolioWriter = {
  writeSnapshots: vi.fn().mockResolvedValue({
    success: true,
    recordsInserted: 0,
    errors: [],
    duplicatesSkipped: 0,
  }),
};

// Mock external dependencies with simple implementations
vi.mock("../../../../src/modules/wallet/fetcher.js", () => ({
  DeBankFetcher: class {
    fetchWalletTokenList = mockDeBankFetcher.fetchWalletTokenList;
    fetchComplexProtocolList = mockDeBankFetcher.fetchComplexProtocolList;
    getRequestStats = mockDeBankFetcher.getRequestStats;
    healthCheck = mockDeBankFetcher.healthCheck;
  },
}));

vi.mock("../../../../src/modules/vip-users/supabaseFetcher.js", () => ({
  SupabaseFetcher: class {
    fetchVipUsers = mockSupabaseFetcher.fetchVipUsers;
    fetchVipUsersWithActivity = mockSupabaseFetcher.fetchVipUsersWithActivity;
    batchUpdatePortfolioTimestamps =
      mockSupabaseFetcher.batchUpdatePortfolioTimestamps;
    getRequestStats = mockSupabaseFetcher.getRequestStats;
    healthCheck = mockSupabaseFetcher.healthCheck;
  },
}));

vi.mock("../../../../src/modules/wallet/balanceTransformer.js", () => ({
  WalletBalanceTransformer: class {
    transformBatch = mockTransformer.transformBatch;
  },
}));

vi.mock("../../../../src/modules/wallet/balanceWriter.js", () => ({
  WalletBalanceWriter: class {
    writeWalletBalanceSnapshots = mockWriter.writeWalletBalanceSnapshots;
  },
}));

vi.mock("../../../../src/modules/wallet/portfolioTransformer.js", () => ({
  DeBankPortfolioTransformer: class {
    transformBatch = mockPortfolioTransformer.transformBatch;
  },
}));

vi.mock("../../../../src/modules/wallet/portfolioWriter.js", () => ({
  PortfolioItemWriter: class {
    writeSnapshots = mockPortfolioWriter.writeSnapshots;
  },
}));

describe("WalletBalanceETLProcessor", () => {
  let processor: WalletBalanceETLProcessor;
  let consoleErrorSpy: vi.SpyInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new WalletBalanceETLProcessor();
    // Spy on console.error to prevent logging during tests and to verify calls
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  const createMockJob = (overrides: Partial<ETLJob> = {}): ETLJob => ({
    jobId: "test-job-123",
    trigger: "manual",
    sources: ["debank"],
    filters: {},
    createdAt: new Date(),
    status: "pending",
    ...overrides,
  });

  describe("constructor", () => {
    it("should initialize successfully", () => {
      expect(processor).toBeDefined();
      expect(processor.getSourceType()).toBe("debank");
    });
  });

  describe("process", () => {
    it("should process wallet balance data successfully", async () => {
      const job = createMockJob();
      const result = await processor.process(job);

      expect(result).toEqual({
        success: true,
        recordsProcessed: 1,
        recordsInserted: 1,
        errors: [],
        source: "debank",
      });
    });

    it("should handle empty VIP users list", async () => {
      const job = createMockJob();
      mockSupabaseFetcher.fetchVipUsers.mockResolvedValueOnce([]);

      const result = await processor.process(job);

      expect(result).toEqual({
        success: true,
        recordsProcessed: 0,
        recordsInserted: 0,
        errors: [],
        source: "debank",
      });
    });

    it("should handle errors during processing", async () => {
      const job = createMockJob();
      mockSupabaseFetcher.fetchVipUsers.mockRejectedValueOnce(
        new Error("Database error"),
      );

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(result.errors).toContain("Database error");
    });

    it("should default missing writer errors to empty array", async () => {
      const job = createMockJob();

      mockWriter.writeWalletBalanceSnapshots.mockResolvedValueOnce({
        success: true,
        recordsInserted: 1,
        errors: "",
        duplicatesSkipped: 0,
      } as unknown);
      mockPortfolioWriter.writeSnapshots.mockResolvedValueOnce({
        success: true,
        recordsInserted: 0,
        errors: "",
        duplicatesSkipped: 0,
      } as unknown);

      const result = await processor.process(job);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("should handle non-Error exceptions during processing", async () => {
      const job = createMockJob();
      mockSupabaseFetcher.fetchVipUsers.mockRejectedValueOnce("Database down");

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(result.errors).toContain("Unknown error");
    });

    it("should continue processing other users if one user fails", async () => {
      // Arrange
      const job = createMockJob();
      const vipUsers = [
        {
          user_id: "user-success",
          wallet: "0x1234567890123456789012345678901234567890",
        },
        {
          user_id: "user-fail",
          wallet: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        },
      ];
      const processingError = new Error("DeBank API limit reached");

      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue(vipUsers);

      // First call for 'user-success' resolves, second for 'user-fail' rejects
      mockDeBankFetcher.fetchWalletTokenList
        .mockResolvedValueOnce([
          {
            id: "0xTokenSuccess",
            chain: "eth",
            name: "SuccessCoin",
            symbol: "SCS",
            amount: 10,
            price: 1,
          },
        ])
        .mockRejectedValueOnce(processingError);

      // fetchComplexProtocolList succeeds for first user, won't be called for failed user
      mockDeBankFetcher.fetchComplexProtocolList.mockResolvedValueOnce([]);

      // Act
      const result = await processor.process(job);

      // Assert
      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1);
      expect(result.recordsInserted).toBe(1);
      expect(result.errors).toEqual([]);

      // Verify that the error was logged correctly for the failed user
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Failed to fetch data for user",
        {
          jobId: job.jobId,
          userId: "user-fail",
          wallet: "0xabcd...abcd",
          error: processingError,
        },
      );

      // Ensure processing continued for the successful user
      expect(mockTransformer.transformBatch).toHaveBeenCalledWith([
        expect.objectContaining({
          user_wallet_address: "0x1234567890123456789012345678901234567890",
        }),
      ]);
    });

    it("should handle cases where transformation results in no data", async () => {
      // Arrange
      const job = createMockJob();
      mockSupabaseFetcher.fetchVipUsers.mockResolvedValue([
        {
          user_id: "user1",
          wallet: "0x1234567890123456789012345678901234567890",
        },
      ]);
      mockDeBankFetcher.fetchWalletTokenList.mockResolvedValue([
        {
          id: "0xToken1",
          chain: "eth",
          name: "JunkCoin",
          symbol: "JNK",
          amount: 100,
          price: 0,
        },
      ]);

      // fetchComplexProtocolList returns empty array (no portfolio items)
      mockDeBankFetcher.fetchComplexProtocolList.mockResolvedValue([]);

      // Transformer returns an empty array, filtering out all raw data
      mockTransformer.transformBatch.mockReturnValue([]);

      // Act
      const result = await processor.process(job);

      // Assert
      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1); // 1 token fetched (before transformation)
      expect(result.recordsInserted).toBe(0); // 0 after transformation
      expect(result.errors).toEqual([]);

      // Verify the warning was logged
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "No valid data after wallet balance transformation",
        {
          jobId: job.jobId,
        },
      );

      // Writer is still called with empty array
      expect(mockWriter.writeWalletBalanceSnapshots).toHaveBeenCalledWith([]);
    });
  });

  describe("healthCheck", () => {
    it("should return healthy when both services are healthy", async () => {
      const result = await processor.healthCheck();
      expect(result).toEqual({ status: "healthy" });
    });

    it("should return unhealthy when a service is unhealthy", async () => {
      mockDeBankFetcher.healthCheck.mockResolvedValueOnce({
        status: "unhealthy",
        details: "API error",
      });

      const result = await processor.healthCheck();

      expect(result.status).toBe("unhealthy");
      expect(result.details).toContain("DeBank: unhealthy");
    });

    it("should include unhealthy status when DeBank details are missing", async () => {
      mockDeBankFetcher.healthCheck.mockResolvedValueOnce({
        status: "unhealthy",
      });

      const result = await processor.healthCheck();

      expect(result.status).toBe("unhealthy");
      expect(result.details).toContain("DeBank: unhealthy");
      expect(result.details).not.toContain("undefined");
    });

    it("should include Supabase details when Supabase is unhealthy", async () => {
      mockSupabaseFetcher.healthCheck.mockResolvedValueOnce({
        status: "unhealthy",
        details: "DB timeout",
      });

      const result = await processor.healthCheck();

      expect(result.status).toBe("unhealthy");
      expect(result.details).toContain("Supabase: unhealthy (DB timeout)");
    });

    it("should handle health check errors with Error instance", async () => {
      mockDeBankFetcher.healthCheck.mockRejectedValueOnce(
        new Error("Health check failed"),
      );

      const result = await processor.healthCheck();

      expect(result.status).toBe("unhealthy");
      expect(result.details).toBe("Health check failed");
    });

    it("should handle health check errors with non-Error values", async () => {
      mockDeBankFetcher.healthCheck.mockRejectedValueOnce(
        "Health check failed",
      );

      const result = await processor.healthCheck();

      expect(result.status).toBe("unhealthy");
      expect(result.details).toBe("Unknown error");
    });
  });

  describe("getStats", () => {
    it("should return combined stats from both fetchers", () => {
      const stats = processor.getStats();

      expect(stats).toEqual({
        debank: {
          requestCount: 0,
          lastRequestTime: 0,
        },
        supabase: {
          requestCount: 0,
          lastRequestTime: 0,
        },
      });
    });
  });

  describe("internal helpers", () => {
    it("should skip undefined balances and portfolio items during aggregation", async () => {
      const processorAny = processor as unknown;
      const processUserWalletSpy = vi
        .spyOn(processorAny, "processUserWallet")
        .mockResolvedValue({
          success: true,
          balances: undefined,
          portfolioItems: undefined,
          successfulWallet: "0xSKIP",
        });

      const result = await processorAny.fetchUserDataBatch(
        [
          {
            user_id: "user-skip",
            wallet: "0xSKIP",
            last_activity_at: null,
            last_portfolio_update_at: null,
          },
        ],
        "job-skip",
      );

      expect(result.walletBalances).toEqual([]);
      expect(result.portfolioItems).toEqual([]);
      expect(result.successfulWallets).toEqual(["0xSKIP"]);

      processUserWalletSpy.mockRestore();
    });

    it("should skip failed user results that have no error message", async () => {
      const processorAny = processor as unknown;
      const processUserWalletSpy = vi
        .spyOn(processorAny, "processUserWallet")
        .mockResolvedValue({
          success: false,
          error: undefined,
        });

      const result = await processorAny.fetchUserDataBatch(
        [
          {
            user_id: "user-missing-error",
            wallet: "0xNOERROR",
            last_activity_at: null,
            last_portfolio_update_at: null,
          },
        ],
        "job-no-error",
      );

      expect(result.walletBalances).toEqual([]);
      expect(result.portfolioItems).toEqual([]);
      expect(result.successfulWallets).toEqual([]);
      expect(mockLogger.warn).not.toHaveBeenCalled();

      processUserWalletSpy.mockRestore();
    });

    it("should surface unknown errors from fetchUserData", async () => {
      const processorAny = processor as unknown;
      const fetchUserDataSpy = vi
        .spyOn(processorAny, "fetchUserData")
        .mockRejectedValue("Fetch failed");

      const result = await processorAny.processUserWallet(
        {
          user_id: "user-error",
          wallet: "0xERROR",
          last_activity_at: null,
          last_portfolio_update_at: null,
        },
        "job-error",
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown error");

      fetchUserDataSpy.mockRestore();
    });

    it("should return a fetch failure when fetchUserData resolves to null", async () => {
      const processorAny = processor as unknown;
      const fetchUserDataSpy = vi
        .spyOn(processorAny, "fetchUserData")
        .mockResolvedValue(null);

      const result = await processorAny.processUserWallet(
        {
          user_id: "user-no-data",
          wallet: "0x0000000000000000000000000000000000000000",
          last_activity_at: null,
          last_portfolio_update_at: null,
        },
        "job-no-data",
      );

      expect(result).toEqual({
        success: false,
        error: "Failed to fetch data for 0x0000...0000",
      });

      fetchUserDataSpy.mockRestore();
    });
  });

  describe("Activity-based filtering integration", () => {
    it("should skip inactive users with recent updates", async () => {
      // Mock user: inactive (10 days) but updated 3 days ago
      const inactiveUser = {
        user_id: "inactive-user",
        wallet: "0xINACTIVE",
        last_activity_at: new Date(
          Date.now() - 10 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        last_portfolio_update_at: new Date(
          Date.now() - 3 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      };

      mockSupabaseFetcher.fetchVipUsersWithActivity.mockResolvedValue([
        inactiveUser,
      ]);

      await processor.process(createMockJob());

      // Verify DeBank API was NOT called for this user
      expect(mockDeBankFetcher.fetchWalletTokenList).not.toHaveBeenCalled();
      expect(mockDeBankFetcher.fetchComplexProtocolList).not.toHaveBeenCalled();
    });

    it("should include active users in processing", async () => {
      const activeUser = {
        user_id: "active-user",
        wallet: "0xACTIVE",
        last_activity_at: new Date(
          Date.now() - 2 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        last_portfolio_update_at: new Date(
          Date.now() - 10 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      };

      mockSupabaseFetcher.fetchVipUsersWithActivity.mockResolvedValue([
        activeUser,
      ]);

      await processor.process(createMockJob());

      expect(mockDeBankFetcher.fetchWalletTokenList).toHaveBeenCalledWith(
        "0xACTIVE",
      );
      expect(mockDeBankFetcher.fetchComplexProtocolList).toHaveBeenCalledWith(
        "0xACTIVE",
      );
    });

    it("should update inactive users after 7+ days", async () => {
      const staleUser = {
        user_id: "stale-user",
        wallet: "0xSTALE",
        last_activity_at: new Date(
          Date.now() - 30 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        last_portfolio_update_at: new Date(
          Date.now() - 8 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      };

      mockSupabaseFetcher.fetchVipUsersWithActivity.mockResolvedValue([
        staleUser,
      ]);

      await processor.process(createMockJob());

      expect(mockDeBankFetcher.fetchWalletTokenList).toHaveBeenCalledWith(
        "0xSTALE",
      );
      expect(mockDeBankFetcher.fetchComplexProtocolList).toHaveBeenCalledWith(
        "0xSTALE",
      );
    });

    it("should handle mixed user populations", async () => {
      const users = [
        {
          user_id: "u1",
          wallet: "0x1111111111111111111111111111111111111111",
          last_activity_at: new Date(
            Date.now() - 2 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          last_portfolio_update_at: null,
        }, // Active, never updated → INCLUDE
        {
          user_id: "u2",
          wallet: "0x2222222222222222222222222222222222222222",
          last_activity_at: new Date(
            Date.now() - 10 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          last_portfolio_update_at: new Date(
            Date.now() - 3 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        }, // Inactive, recent update → SKIP
        {
          user_id: "u3",
          wallet: "0x3333333333333333333333333333333333333333",
          last_activity_at: new Date(
            Date.now() - 15 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          last_portfolio_update_at: new Date(
            Date.now() - 8 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        }, // Inactive, stale update → INCLUDE
      ];

      mockSupabaseFetcher.fetchVipUsersWithActivity.mockResolvedValue(users);

      await processor.process(createMockJob());

      // Should process 2 out of 3 users
      expect(mockDeBankFetcher.fetchWalletTokenList).toHaveBeenCalledTimes(2);
      expect(mockDeBankFetcher.fetchWalletTokenList).toHaveBeenCalledWith(
        "0x1111111111111111111111111111111111111111",
      );
      expect(mockDeBankFetcher.fetchWalletTokenList).toHaveBeenCalledWith(
        "0x3333333333333333333333333333333333333333",
      );
      expect(mockDeBankFetcher.fetchWalletTokenList).not.toHaveBeenCalledWith(
        "0x2222222222222222222222222222222222222222",
      );
    });

    it("should log correct cost savings stats", async () => {
      // 10 users: 3 to update, 7 to skip = 70% savings
      const users = Array.from({ length: 10 }, (_, i) => ({
        user_id: `user${i}`,
        wallet: `0x${i.toString().padStart(40, "0")}`,
        last_activity_at: new Date(
          Date.now() - 10 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        last_portfolio_update_at:
          i < 3
            ? new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() // Stale → include
            : new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // Recent → skip
      }));

      mockSupabaseFetcher.fetchVipUsersWithActivity.mockResolvedValue(users);

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
      const users = [
        {
          user_id: "u1",
          wallet: "0xWALLET1111111111111111111111111111111111",
          last_activity_at: null,
          last_portfolio_update_at: null,
        },
        {
          user_id: "u2",
          wallet: "0xWALLET2222222222222222222222222222222222",
          last_activity_at: null,
          last_portfolio_update_at: null,
        },
      ];

      mockSupabaseFetcher.fetchVipUsersWithActivity.mockResolvedValue(users);

      await processor.process(createMockJob());

      expect(
        mockSupabaseFetcher.batchUpdatePortfolioTimestamps,
      ).toHaveBeenCalledWith([
        "0xWALLET1111111111111111111111111111111111",
        "0xWALLET2222222222222222222222222222222222",
      ]);
    });

    it("should handle timestamp update failure gracefully", async () => {
      const users = [
        {
          user_id: "u1",
          wallet: "0xWALLET1111111111111111111111111111111111",
          last_activity_at: null,
          last_portfolio_update_at: null,
        },
      ];

      mockSupabaseFetcher.fetchVipUsersWithActivity.mockResolvedValue(users);
      mockSupabaseFetcher.batchUpdatePortfolioTimestamps.mockRejectedValue(
        new Error("Timestamp update failed"),
      );

      // Set up fetcher mocks to return data
      mockDeBankFetcher.fetchWalletTokenList.mockResolvedValue([
        {
          id: "0xtoken1",
          chain: "eth",
          name: "TestToken",
          symbol: "TEST",
          amount: 100,
          price: 1,
        },
      ]);
      mockDeBankFetcher.fetchComplexProtocolList.mockResolvedValue([]);

      // Set up transformer and writer mocks
      mockTransformer.transformBatch.mockReturnValue([
        {
          user_wallet_address: "0xWALLET1111111111111111111111111111111111",
          token_address: "0xtoken1",
          chain: "eth",
          symbol: "TEST",
          amount: 100,
        },
      ]);
      mockWriter.writeWalletBalanceSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 1,
        errors: [],
        duplicatesSkipped: 0,
      });
      mockPortfolioWriter.writeSnapshots.mockResolvedValue({
        success: true,
        recordsInserted: 0,
        errors: [],
        duplicatesSkipped: 0,
      });

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
      const users = [
        {
          user_id: "u1",
          wallet: "0x1111111111111111111111111111111111111111",
          last_activity_at: new Date(
            Date.now() - 10 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          last_portfolio_update_at: new Date(
            Date.now() - 1 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        },
      ];

      mockSupabaseFetcher.fetchVipUsersWithActivity.mockResolvedValue(users);

      const result = await processor.process(createMockJob());

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(0);
      expect(mockDeBankFetcher.fetchWalletTokenList).not.toHaveBeenCalled();
    });

    it("should handle exactly 7-day boundary correctly", async () => {
      const exactlySevenDays = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const users = [
        {
          user_id: "boundary",
          wallet: "0xBOUNDARY1111111111111111111111111111111",
          last_activity_at: exactlySevenDays.toISOString(),
          last_portfolio_update_at: new Date(
            Date.now() - 2 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        },
      ];

      // At exactly 7 days, user is considered inactive
      // Should be skipped (updated 2 days ago)
      mockSupabaseFetcher.fetchVipUsersWithActivity.mockResolvedValue(users);

      await processor.process(createMockJob());

      expect(mockDeBankFetcher.fetchWalletTokenList).not.toHaveBeenCalled();
    });
  });
});
