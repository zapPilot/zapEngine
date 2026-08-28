/**
 * Unit tests for WalletBalanceETLProcessor
 * Simplified tests focusing on core functionality and coverage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WalletBalanceETLProcessor } from '../../../../src/modules/wallet/processor.js';
import { captureBackgroundException } from '../../../../src/observability/sentry.js';
import type { ETLJob, ETLUserCandidate } from '../../../../src/types/index.js';
import { logger as mockLogger } from '../../../../src/utils/logger.js';
import { createEtlJob } from '../../../utils/createEtlJob.js';

vi.mock('../../../../src/observability/sentry.js', () => ({
  captureBackgroundException: vi.fn(),
}));

// Mock the logger to prevent console output during tests
vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

// Mock the mask utility
vi.mock('../../../../src/utils/mask.js', async () => {
  const { mockWalletAddressMask } = await import('../../../setup/mocks.js');
  return mockWalletAddressMask();
});

// Create simple mock implementations that always work
const mockDeBankFetcher = {
  fetchWalletTokenList: vi.fn().mockResolvedValue([
    {
      id: '0x1234567890123456789012345678901234567890',
      chain: 'eth',
      name: 'ethereum',
      symbol: 'eth',
      amount: 5.25,
      price: 1800.5,
    },
  ]),
  fetchComplexProtocolList: vi.fn().mockResolvedValue([]),
  getRequestStats: vi.fn().mockReturnValue({
    requestCount: 0,
    lastRequestTime: 0,
  }),
  healthCheck: vi.fn().mockResolvedValue({ status: 'healthy' }),
};

// The SQL policy decides who is due; these fixtures stand in for its answer.
function dueUser(
  userId: string,
  wallet: string,
  overrides: Partial<ETLUserCandidate> = {},
): ETLUserCandidate {
  return {
    userId,
    wallet,
    planCode: 'vip',
    defaultTier: 'priority',
    overrideTier: null,
    effectiveTier: 'priority',
    lastActivityAt: null,
    lastPortfolioUpdateAt: null,
    refreshIntervalHours: 24,
    dueForRefresh: true,
    ...overrides,
  };
}

const mockSupabaseFetcher = {
  fetchUserServiceStates: vi
    .fn()
    .mockResolvedValue([
      dueUser('user1', '0x1234567890123456789012345678901234567890'),
    ]),
  batchUpdatePortfolioTimestamps: vi.fn().mockResolvedValue(undefined),
  recordUserResourceUsage: vi.fn().mockResolvedValue(undefined),
  getRequestStats: vi.fn().mockReturnValue({
    requestCount: 0,
    lastRequestTime: 0,
  }),
  healthCheck: vi.fn().mockResolvedValue({ status: 'healthy' }),
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
      chain: item.chain || 'ethereum',
      symbol: item.symbol || 'eth',
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
vi.mock('../../../../src/modules/wallet/fetcher.js', () => ({
  DeBankFetcher: class {
    fetchWalletTokenList = mockDeBankFetcher.fetchWalletTokenList;
    fetchComplexProtocolList = mockDeBankFetcher.fetchComplexProtocolList;
    getRequestStats = mockDeBankFetcher.getRequestStats;
    healthCheck = mockDeBankFetcher.healthCheck;
  },
}));

vi.mock('../../../../src/modules/user-service/supabaseFetcher.js', () => ({
  SupabaseFetcher: class {
    fetchUserServiceStates = mockSupabaseFetcher.fetchUserServiceStates;
    batchUpdatePortfolioTimestamps =
      mockSupabaseFetcher.batchUpdatePortfolioTimestamps;
    recordUserResourceUsage = mockSupabaseFetcher.recordUserResourceUsage;
    getRequestStats = mockSupabaseFetcher.getRequestStats;
    healthCheck = mockSupabaseFetcher.healthCheck;
  },
}));

vi.mock('../../../../src/modules/wallet/balanceTransformer.js', () => ({
  WalletBalanceTransformer: class {
    transformBatch = mockTransformer.transformBatch;
  },
}));

vi.mock('../../../../src/modules/wallet/balanceWriter.js', () => ({
  WalletBalanceWriter: class {
    writeWalletBalanceSnapshots = mockWriter.writeWalletBalanceSnapshots;
  },
}));

vi.mock('../../../../src/modules/wallet/portfolioTransformer.js', () => ({
  DeBankPortfolioTransformer: class {
    transformBatch = mockPortfolioTransformer.transformBatch;
  },
}));

vi.mock('../../../../src/modules/wallet/portfolioWriter.js', () => ({
  PortfolioItemWriter: class {
    writeSnapshots = mockPortfolioWriter.writeSnapshots;
  },
}));

describe('WalletBalanceETLProcessor', () => {
  let processor: WalletBalanceETLProcessor;
  let consoleErrorSpy: vi.SpyInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    processor = new WalletBalanceETLProcessor();
    // Spy on console.error to prevent logging during tests and to verify calls
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  const createMockJob = (overrides: Partial<ETLJob> = {}): ETLJob =>
    createEtlJob({
      jobId: 'test-job-123',
      sources: ['debank'],
      filters: {},
      createdAt: new Date(),
      ...overrides,
    });

  describe('constructor', () => {
    it('should initialize successfully', () => {
      expect(processor).toBeDefined();
      expect(processor.getSourceType()).toBe('debank');
    });
  });

  describe('process', () => {
    it('should process wallet balance data successfully', async () => {
      const job = createMockJob();
      const result = await processor.process(job);

      expect(result).toEqual({
        success: true,
        recordsProcessed: 1,
        recordsInserted: 1,
        errors: [],
        source: 'debank',
      });
    });

    it('should handle an empty due-wallet list', async () => {
      const job = createMockJob();
      mockSupabaseFetcher.fetchUserServiceStates.mockResolvedValueOnce([]);

      const result = await processor.process(job);

      expect(result).toEqual({
        success: true,
        recordsProcessed: 0,
        recordsInserted: 0,
        errors: [],
        source: 'debank',
      });
    });

    it('should handle errors during processing', async () => {
      const job = createMockJob();
      mockSupabaseFetcher.fetchUserServiceStates.mockRejectedValueOnce(
        new Error('Database error'),
      );

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Database error');
    });

    it('should default missing writer errors to empty array', async () => {
      const job = createMockJob();

      mockWriter.writeWalletBalanceSnapshots.mockResolvedValueOnce({
        success: true,
        recordsInserted: 1,
        errors: '',
        duplicatesSkipped: 0,
      } as unknown);
      mockPortfolioWriter.writeSnapshots.mockResolvedValueOnce({
        success: true,
        recordsInserted: 0,
        errors: '',
        duplicatesSkipped: 0,
      } as unknown);

      const result = await processor.process(job);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should handle non-Error exceptions during processing', async () => {
      const job = createMockJob();
      mockSupabaseFetcher.fetchUserServiceStates.mockRejectedValueOnce(
        'Database down',
      );

      const result = await processor.process(job);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Unknown error');
    });

    it('should continue processing other users if one user fails', async () => {
      // Arrange
      const job = createMockJob();
      const dueUsers = [
        dueUser('user-success', '0x1234567890123456789012345678901234567890'),
        dueUser('user-fail', '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'),
      ];
      const processingError = new Error('DeBank API limit reached');

      mockSupabaseFetcher.fetchUserServiceStates.mockResolvedValue(dueUsers);

      // First call for 'user-success' resolves, second for 'user-fail' rejects
      mockDeBankFetcher.fetchWalletTokenList
        .mockResolvedValueOnce([
          {
            id: '0xTokenSuccess',
            chain: 'eth',
            name: 'SuccessCoin',
            symbol: 'SCS',
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
      expect(result.success).toBe(false);
      expect(result.recordsProcessed).toBe(1);
      expect(result.recordsInserted).toBe(1);
      expect(result.errors).toEqual([
        'User 0xabcd...abcd: DeBank API limit reached',
      ]);

      // Verify that the error was logged correctly for the failed user
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to fetch data for user',
        {
          jobId: job.jobId,
          userId: 'user-fail',
          wallet: '0xabcd...abcd',
          error: processingError,
        },
      );

      expect(captureBackgroundException).toHaveBeenCalledWith(processingError, {
        component: 'job',
        tags: { failure_scope: 'wallet_user', provider: 'debank' },
        context: {
          jobId: job.jobId,
          userId: 'user-fail',
          wallet: '0xabcd...abcd',
        },
        level: 'error',
      });

      // Ensure processing continued for the successful user
      expect(mockTransformer.transformBatch).toHaveBeenCalledWith([
        expect.objectContaining({
          user_wallet_address: '0x1234567890123456789012345678901234567890',
        }),
      ]);
    });

    it('should handle cases where transformation results in no data', async () => {
      // Arrange
      const job = createMockJob();
      mockSupabaseFetcher.fetchUserServiceStates.mockResolvedValue([
        dueUser('user1', '0x1234567890123456789012345678901234567890'),
      ]);
      mockDeBankFetcher.fetchWalletTokenList.mockResolvedValue([
        {
          id: '0xToken1',
          chain: 'eth',
          name: 'JunkCoin',
          symbol: 'JNK',
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
        'No valid data after wallet balance transformation',
        {
          jobId: job.jobId,
        },
      );

      // Successful empty data clears the wallet/day slice.
      expect(mockWriter.writeWalletBalanceSnapshots).toHaveBeenCalledWith(
        [],
        ['0x1234567890123456789012345678901234567890'],
      );
    });
  });

  describe('healthCheck', () => {
    it('should return healthy when both services are healthy', async () => {
      const result = await processor.healthCheck();
      expect(result).toEqual({ status: 'healthy' });
    });

    it('should return unhealthy when a service is unhealthy', async () => {
      mockDeBankFetcher.healthCheck.mockResolvedValueOnce({
        status: 'unhealthy',
        details: 'API error',
      });

      const result = await processor.healthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.details).toContain('DeBank: unhealthy');
    });

    it('should include unhealthy status when DeBank details are missing', async () => {
      mockDeBankFetcher.healthCheck.mockResolvedValueOnce({
        status: 'unhealthy',
      });

      const result = await processor.healthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.details).toContain('DeBank: unhealthy');
      expect(result.details).not.toContain('undefined');
    });

    it('should include Supabase details when Supabase is unhealthy', async () => {
      mockSupabaseFetcher.healthCheck.mockResolvedValueOnce({
        status: 'unhealthy',
        details: 'DB timeout',
      });

      const result = await processor.healthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.details).toContain('Supabase: unhealthy (DB timeout)');
    });

    it('should handle health check errors with Error instance', async () => {
      mockDeBankFetcher.healthCheck.mockRejectedValueOnce(
        new Error('Health check failed'),
      );

      const result = await processor.healthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.details).toBe('Health check failed');
    });

    it('should handle health check errors with non-Error values', async () => {
      mockDeBankFetcher.healthCheck.mockRejectedValueOnce(
        'Health check failed',
      );

      const result = await processor.healthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.details).toBe('Unknown error');
    });
  });

  describe('getStats', () => {
    it('should return combined stats from both fetchers', () => {
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

  describe('internal helpers', () => {
    it('should skip undefined balances and portfolio items during aggregation', async () => {
      const processorAny = processor as unknown;
      const processUserWalletSpy = vi
        .spyOn(processorAny, 'processUserWallet')
        .mockResolvedValue({
          success: true,
          balances: undefined,
          portfolioItems: undefined,
          successfulWallet: '0xSKIP',
        });

      const result = await processorAny.fetchUserDataBatch(
        [dueUser('user-skip', '0xSKIP')],
        'job-skip',
      );

      expect(result.walletBalances).toEqual([]);
      expect(result.portfolioItems).toEqual([]);
      expect(result.successfulWallets).toEqual(['0xSKIP']);

      processUserWalletSpy.mockRestore();
    });

    it('should skip failed user results that have no error message', async () => {
      const processorAny = processor as unknown;
      const processUserWalletSpy = vi
        .spyOn(processorAny, 'processUserWallet')
        .mockResolvedValue({
          success: false,
          error: undefined,
        });

      const result = await processorAny.fetchUserDataBatch(
        [dueUser('user-missing-error', '0xNOERROR')],
        'job-no-error',
      );

      expect(result.walletBalances).toEqual([]);
      expect(result.portfolioItems).toEqual([]);
      expect(result.successfulWallets).toEqual([]);
      expect(mockLogger.warn).not.toHaveBeenCalled();

      processUserWalletSpy.mockRestore();
    });

    it('should surface unknown errors from fetchUserData', async () => {
      const processorAny = processor as unknown;
      const fetchUserDataSpy = vi
        .spyOn(processorAny, 'fetchUserData')
        .mockRejectedValue('Fetch failed');

      const result = await processorAny.processUserWallet(
        dueUser('user-error', '0xERROR'),
        'job-error',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown error');

      fetchUserDataSpy.mockRestore();
    });

    it('should return a fetch failure when fetchUserData resolves to null', async () => {
      const processorAny = processor as unknown;
      const fetchUserDataSpy = vi
        .spyOn(processorAny, 'fetchUserData')
        .mockResolvedValue(null);

      const result = await processorAny.processUserWallet(
        dueUser('user-no-data', '0x0000000000000000000000000000000000000000'),
        'job-no-data',
      );

      expect(result).toEqual({
        success: false,
        error: 'Failed to fetch data for 0x0000...0000',
      });
      expect(captureBackgroundException).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Failed to fetch data for 0x0000...0000',
        }),
        {
          component: 'job',
          tags: { failure_scope: 'wallet_user', provider: 'debank' },
          context: {
            jobId: 'job-no-data',
            userId: 'user-no-data',
            wallet: '0x0000...0000',
          },
          level: 'error',
        },
      );

      fetchUserDataSpy.mockRestore();
    });
  });

  describe('Service-tier scheduling', () => {
    it('refreshes a priority wallet the SQL policy marked due', async () => {
      mockSupabaseFetcher.fetchUserServiceStates.mockResolvedValue([
        dueUser('due-user', '0xDUE'),
      ]);

      await processor.process(createMockJob());

      expect(mockDeBankFetcher.fetchWalletTokenList).toHaveBeenCalledWith(
        '0xDUE',
      );
      expect(mockDeBankFetcher.fetchComplexProtocolList).toHaveBeenCalledWith(
        '0xDUE',
      );
    });

    it('spends nothing on a priority wallet that was refreshed recently', async () => {
      mockSupabaseFetcher.fetchUserServiceStates.mockResolvedValue([
        dueUser('recent-user', '0xRECENT', {
          lastPortfolioUpdateAt: new Date().toISOString(),
          dueForRefresh: false,
        }),
      ]);

      const result = await processor.process(createMockJob());

      expect(result.success).toBe(true);
      expect(mockDeBankFetcher.fetchWalletTokenList).not.toHaveBeenCalled();
    });

    it('spends nothing on wallets outside the priority tier', async () => {
      mockSupabaseFetcher.fetchUserServiceStates.mockResolvedValue([
        dueUser('free-user', '0xFREE', {
          planCode: 'free',
          defaultTier: 'standard',
          effectiveTier: 'standard',
          refreshIntervalHours: null,
          dueForRefresh: false,
        }),
        dueUser('paused-user', '0xPAUSED', {
          overrideTier: 'paused',
          effectiveTier: 'paused',
          dueForRefresh: false,
        }),
      ]);

      await processor.process(createMockJob());

      expect(mockDeBankFetcher.fetchWalletTokenList).not.toHaveBeenCalled();
    });

    it('reports what it scheduled and what it skipped', async () => {
      mockSupabaseFetcher.fetchUserServiceStates.mockResolvedValue([
        dueUser('due-user', '0xDUE'),
        dueUser('recent-user', '0xRECENT', { dueForRefresh: false }),
        dueUser('free-user', '0xFREE', {
          effectiveTier: 'standard',
          refreshIntervalHours: null,
          dueForRefresh: false,
        }),
      ]);

      await processor.process(createMockJob());

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Wallets selected for refresh',
        expect.objectContaining({
          source: 'debank',
          candidatesTotal: 3,
          usersToUpdate: 1,
          skippedNotDue: 1,
          skippedByTier: 1,
        }),
      );
    });
  });

  describe('Cost attribution', () => {
    it('bills each refreshed wallet the two DeBank calls it costs', async () => {
      mockSupabaseFetcher.fetchUserServiceStates.mockResolvedValue([
        dueUser('u1', '0xWALLET1111111111111111111111111111111111'),
      ]);

      await processor.process(createMockJob());

      expect(mockSupabaseFetcher.recordUserResourceUsage).toHaveBeenCalledWith([
        expect.objectContaining({
          user_id: 'u1',
          wallet: '0xWALLET1111111111111111111111111111111111',
          provider: 'debank',
          resource: 'portfolio_refresh',
          request_count: 2,
        }),
      ]);
    });

    it('keeps the batch successful when the usage ledger is unreachable', async () => {
      mockSupabaseFetcher.fetchUserServiceStates.mockResolvedValue([
        dueUser('u1', '0xWALLET1111111111111111111111111111111111'),
      ]);
      mockSupabaseFetcher.recordUserResourceUsage.mockRejectedValueOnce(
        new Error('ops schema unreachable'),
      );

      const result = await processor.process(createMockJob());

      expect(result.success).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to record per-user resource usage',
        expect.objectContaining({ rowCount: 1 }),
      );
    });

    it('records nothing when no wallet was due', async () => {
      mockSupabaseFetcher.fetchUserServiceStates.mockResolvedValue([]);

      await processor.process(createMockJob());

      expect(
        mockSupabaseFetcher.recordUserResourceUsage,
      ).not.toHaveBeenCalled();
    });
  });

  describe('Portfolio timestamp updates', () => {
    it('should call batchUpdatePortfolioTimestamps for successful wallets', async () => {
      mockSupabaseFetcher.fetchUserServiceStates.mockResolvedValue([
        dueUser('u1', '0xWALLET1111111111111111111111111111111111'),
        dueUser('u2', '0xWALLET2222222222222222222222222222222222'),
      ]);

      await processor.process(createMockJob());

      expect(
        mockSupabaseFetcher.batchUpdatePortfolioTimestamps,
      ).toHaveBeenCalledWith([
        '0xWALLET1111111111111111111111111111111111',
        '0xWALLET2222222222222222222222222222222222',
      ]);
    });

    it('should handle timestamp update failure gracefully', async () => {
      mockSupabaseFetcher.fetchUserServiceStates.mockResolvedValue([
        dueUser('u1', '0xWALLET1111111111111111111111111111111111'),
      ]);
      mockSupabaseFetcher.batchUpdatePortfolioTimestamps.mockRejectedValue(
        new Error('Timestamp update failed'),
      );

      mockDeBankFetcher.fetchWalletTokenList.mockResolvedValue([
        {
          id: '0xtoken1',
          chain: 'eth',
          name: 'TestToken',
          symbol: 'TEST',
          amount: 100,
          price: 1,
        },
      ]);
      mockDeBankFetcher.fetchComplexProtocolList.mockResolvedValue([]);

      mockTransformer.transformBatch.mockReturnValue([
        {
          user_wallet_address: '0xWALLET1111111111111111111111111111111111',
          token_address: '0xtoken1',
          chain: 'eth',
          symbol: 'TEST',
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
        'Failed to batch update portfolio timestamps',
        expect.any(Object),
      );
    });

    it('should not call batchUpdatePortfolioTimestamps if no users processed', async () => {
      mockSupabaseFetcher.fetchUserServiceStates.mockResolvedValue([]);

      await processor.process(createMockJob());

      expect(
        mockSupabaseFetcher.batchUpdatePortfolioTimestamps,
      ).not.toHaveBeenCalled();
    });
  });
});
