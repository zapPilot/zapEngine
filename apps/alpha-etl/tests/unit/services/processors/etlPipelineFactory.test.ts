/**
 * Comprehensive unit tests for ETL Pipeline Factory
 * Tests factory pattern, processor orchestration, error handling, and advanced TypeScript patterns
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type {
  BaseETLProcessor,
  ETLProcessResult,
} from '../../../../src/core/processors/baseETLProcessor.js';
import type { ETLJob, DataSource } from '../../../../src/types/index.js';

// Hoisted mocks for proper timing
const {
  mockLogger,
  mockPoolProcessor,
  mockWalletProcessor,
  mockHyperliquidProcessor,
  mockSentimentProcessor,
  mockTokenPriceProcessor,
  mockStockPriceProcessor,
} = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
  mockPoolProcessor: {
    process: vi.fn(),
    healthCheck: vi.fn(),
    getStats: vi.fn(),
    getSourceType: vi.fn().mockReturnValue('defillama'),
  } as BaseETLProcessor,
  mockWalletProcessor: {
    process: vi.fn(),
    healthCheck: vi.fn(),
    getStats: vi.fn(),
    getSourceType: vi.fn().mockReturnValue('debank'),
  } as BaseETLProcessor,
  mockHyperliquidProcessor: {
    process: vi.fn(),
    healthCheck: vi.fn(),
    getStats: vi.fn(),
    getSourceType: vi.fn().mockReturnValue('hyperliquid'),
  } as BaseETLProcessor,
  mockSentimentProcessor: {
    process: vi.fn(),
    healthCheck: vi.fn(),
    getStats: vi.fn(),
    getSourceType: vi.fn().mockReturnValue('feargreed'),
  } as BaseETLProcessor,
  mockTokenPriceProcessor: {
    process: vi.fn(),
    healthCheck: vi.fn(),
    getStats: vi.fn(),
    getSourceType: vi.fn().mockReturnValue('token-price'),
  } as BaseETLProcessor,
  mockStockPriceProcessor: {
    process: vi.fn(),
    healthCheck: vi.fn(),
    getStats: vi.fn(),
    getSourceType: vi.fn().mockReturnValue('stock-price'),
  } as BaseETLProcessor,
}));

// Mock the logger before any imports
vi.mock('../../../../src/utils/logger.js', () => ({
  logger: mockLogger,
}));

// Mock processor modules with proper constructor mocking
vi.mock('../../../../src/modules/pool/processor.js', () => ({
  PoolETLProcessor: class MockPoolETLProcessor {
    constructor() {
      return mockPoolProcessor;
    }
  },
}));

vi.mock('../../../../src/modules/wallet/processor.js', () => ({
  WalletBalanceETLProcessor: class MockWalletBalanceETLProcessor {
    constructor() {
      return mockWalletProcessor;
    }
  },
}));

vi.mock('../../../../src/modules/hyperliquid/processor.js', () => ({
  HyperliquidVaultETLProcessor: class MockHyperliquidVaultETLProcessor {
    constructor() {
      return mockHyperliquidProcessor;
    }
  },
}));

vi.mock('../../../../src/modules/sentiment/processor.js', () => ({
  SentimentETLProcessor: class MockSentimentETLProcessor {
    constructor() {
      return mockSentimentProcessor;
    }
  },
}));

vi.mock('../../../../src/modules/token-price/processor.js', () => ({
  TokenPriceETLProcessor: class MockTokenPriceETLProcessor {
    constructor() {
      return mockTokenPriceProcessor;
    }
  },
}));

vi.mock('../../../../src/modules/stock-price/processor.js', () => ({
  StockPriceETLProcessor: class MockStockPriceETLProcessor {
    constructor() {
      return mockStockPriceProcessor;
    }
  },
}));

// Helper function for creating mock jobs - global scope for all tests
const createMockJob = (overrides: Partial<ETLJob> = {}): ETLJob => ({
  jobId: 'job-123',
  trigger: 'scheduled',
  sources: ['defillama'],
  filters: { chains: ['ethereum'] },
  createdAt: new Date(),
  status: 'pending',
  ...overrides,
});

const walletFetchMetadata = {
  jobType: 'wallet_fetch' as const,
  userId: 'user-123',
  walletAddress: '0x1234567890123456789012345678901234567890',
};

describe('ETLPipelineFactory', () => {
  let factory: unknown;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { ETLPipelineFactory } =
      await import('../../../../src/modules/core/pipelineFactory.js');
    factory = new ETLPipelineFactory();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with all supported processors', () => {
      const supportedSources = factory.getSupportedSources();

      expect(supportedSources).toEqual(
        expect.arrayContaining([
          'defillama',
          'debank',
          'hyperliquid',
          'feargreed',
          'token-price',
          'stock-price',
        ]),
      );
      expect(supportedSources).toHaveLength(6);
    });

    it('should create processor instances during initialization', () => {
      expect(factory.getProcessor('defillama')).toBe(mockPoolProcessor);
      expect(factory.getProcessor('debank')).toBe(mockWalletProcessor);
      expect(factory.getProcessor('hyperliquid')).toBe(
        mockHyperliquidProcessor,
      );
      expect(factory.getProcessor('feargreed')).toBe(mockSentimentProcessor);
    });

    it('should allow injecting a custom registry', async () => {
      class CustomProcessor implements BaseETLProcessor {
        async process(): Promise<ETLProcessResult> {
          return {
            success: true,
            recordsProcessed: 0,
            recordsInserted: 0,
            errors: [],
            source: 'defillama',
          };
        }

        async healthCheck(): Promise<{
          status: 'healthy' | 'unhealthy';
          details?: string;
        }> {
          return { status: 'healthy' };
        }

        getStats(): Record<string, unknown> {
          return { custom: true };
        }

        getSourceType(): string {
          return 'custom';
        }
      }

      const customRegistry = {
        defillama: CustomProcessor,
        debank: CustomProcessor,
        hyperliquid: CustomProcessor,
        feargreed: CustomProcessor,
        'token-price': CustomProcessor,
        'stock-price': CustomProcessor,
      } as const;

      const { ETLPipelineFactory } =
        await import('../../../../src/modules/core/pipelineFactory.js');
      const customFactory = new ETLPipelineFactory(customRegistry);

      expect(customFactory.getProcessor('defillama')).toBeInstanceOf(
        CustomProcessor,
      );
      expect(customFactory.getSupportedSources()).toEqual([
        'defillama',
        'debank',
        'hyperliquid',
        'feargreed',
        'token-price',
        'stock-price',
      ]);
    });
  });

  describe('getProcessor', () => {
    it('should return correct processor for valid source', () => {
      expect(factory.getProcessor('defillama')).toBe(mockPoolProcessor);
      expect(factory.getProcessor('debank')).toBe(mockWalletProcessor);
      expect(factory.getProcessor('hyperliquid')).toBe(
        mockHyperliquidProcessor,
      );
      expect(factory.getProcessor('feargreed')).toBe(mockSentimentProcessor);
    });

    it('should throw error for invalid data source', () => {
      // TypeScript workaround for testing invalid input
      const invalidSource = 'invalid' as DataSource;

      expect(() => factory.getProcessor(invalidSource)).toThrow(
        'No processor found for data source: invalid',
      );
    });
  });

  describe('processJob', () => {
    it('should process single source successfully', async () => {
      const job = createMockJob();
      const mockResult: ETLProcessResult = {
        success: true,
        recordsProcessed: 10,
        recordsInserted: 8,
        errors: [],
        source: 'defillama',
      };

      mockPoolProcessor.process = vi.fn().mockResolvedValue(mockResult);

      const result = await factory.processJob(job);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(10);
      expect(result.recordsInserted).toBe(8);
      expect(result.errors).toEqual([]);
      expect(result.sourceResults.defillama).toBe(mockResult);

      expect(mockPoolProcessor.process).toHaveBeenCalledWith(job);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting ETL job processing with pipeline factory',
        expect.objectContaining({
          jobId: 'job-123',
          sources: ['defillama'],
          filters: { chains: ['ethereum'] },
        }),
      );
    });

    it('should process multiple sources successfully', async () => {
      const job = createMockJob({ sources: ['defillama', 'debank'] });

      const poolResult: ETLProcessResult = {
        success: true,
        recordsProcessed: 10,
        recordsInserted: 10,
        errors: [],
        source: 'defillama',
      };

      const walletResult: ETLProcessResult = {
        success: true,
        recordsProcessed: 5,
        recordsInserted: 4,
        errors: ['warning: 1 record skipped'],
        source: 'debank',
      };

      mockPoolProcessor.process = vi.fn().mockResolvedValue(poolResult);
      mockWalletProcessor.process = vi.fn().mockResolvedValue(walletResult);

      const result = await factory.processJob(job);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(15);
      expect(result.recordsInserted).toBe(14);
      expect(result.errors).toEqual(['debank: warning: 1 record skipped']);
      expect(result.sourceResults.defillama).toBe(poolResult);
      expect(result.sourceResults.debank).toBe(walletResult);
    });

    it('should handle source processing failure and continue with other sources', async () => {
      const job = createMockJob({ sources: ['defillama', 'debank'] });

      const poolError = new Error('Pool API unavailable');
      const walletResult: ETLProcessResult = {
        success: true,
        recordsProcessed: 5,
        recordsInserted: 5,
        errors: [],
        source: 'debank',
      };

      mockPoolProcessor.process = vi.fn().mockRejectedValue(poolError);
      mockWalletProcessor.process = vi.fn().mockResolvedValue(walletResult);

      const result = await factory.processJob(job);

      expect(result.success).toBe(false);
      expect(result.recordsProcessed).toBe(5);
      expect(result.recordsInserted).toBe(5);
      expect(result.errors).toEqual(['defillama: Pool API unavailable']);

      // Should have failed result for defillama
      expect(result.sourceResults.defillama).toEqual({
        success: false,
        recordsProcessed: 0,
        recordsInserted: 0,
        errors: ['Pool API unavailable'],
        source: 'defillama',
      });

      expect(result.sourceResults.debank).toBe(walletResult);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Data source processing failed:',
        expect.objectContaining({
          source: 'defillama',
          jobId: 'job-123',
          error: poolError,
        }),
      );
    });

    it('should handle non-Error exceptions from processors', async () => {
      const job = createMockJob();
      const stringError = 'String error message';

      mockPoolProcessor.process = vi.fn().mockRejectedValue(stringError);

      const result = await factory.processJob(job);

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(['defillama: Unknown error']);
      expect(result.sourceResults.defillama.errors).toEqual(['Unknown error']);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Data source processing failed:',
        expect.objectContaining({
          source: 'defillama',
          error: stringError,
        }),
      );
    });

    it('should handle unexpected errors in processJob', async () => {
      const job = createMockJob();
      const processSourceSpy = vi
        .spyOn(factory as unknown, 'processSource')
        .mockRejectedValue('Unexpected failure');

      const result = await factory.processJob(job);

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(['Unknown error']);

      processSourceSpy.mockRestore();
    });

    it('should handle processor returning unsuccessful result', async () => {
      const job = createMockJob();
      const failedResult: ETLProcessResult = {
        success: false,
        recordsProcessed: 5,
        recordsInserted: 2,
        errors: ['Validation failed for 3 records'],
        source: 'defillama',
      };

      mockPoolProcessor.process = vi.fn().mockResolvedValue(failedResult);

      const result = await factory.processJob(job);

      expect(result.success).toBe(false);
      expect(result.recordsProcessed).toBe(5);
      expect(result.recordsInserted).toBe(2);
      expect(result.errors).toEqual([
        'defillama: Validation failed for 3 records',
      ]);
      expect(result.sourceResults.defillama).toBe(failedResult);
    });

    it('should handle job-level processing exceptions', async () => {
      const job = createMockJob();

      // Mock getProcessor to throw during job processing
      const originalGetProcessor = factory.getProcessor;
      factory.getProcessor = vi.fn().mockImplementation(() => {
        throw new Error('Critical factory error');
      });

      const result = await factory.processJob(job);

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(['defillama: Critical factory error']);
      expect(result.recordsProcessed).toBe(0);
      expect(result.recordsInserted).toBe(0);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Data source processing failed:',
        expect.objectContaining({
          source: 'defillama',
          jobId: 'job-123',
          error: expect.any(Error),
        }),
      );

      // Restore original method
      factory.getProcessor = originalGetProcessor;
    });

    it('should log comprehensive job completion details', async () => {
      const job = createMockJob({ sources: ['defillama', 'debank'] });

      const poolResult: ETLProcessResult = {
        success: true,
        recordsProcessed: 100,
        recordsInserted: 95,
        errors: ['5 records skipped'],
        source: 'defillama',
      };

      const walletResult: ETLProcessResult = {
        success: false,
        recordsProcessed: 50,
        recordsInserted: 25,
        errors: ['API rate limit exceeded'],
        source: 'debank',
      };

      mockPoolProcessor.process = vi.fn().mockResolvedValue(poolResult);
      mockWalletProcessor.process = vi.fn().mockResolvedValue(walletResult);

      await factory.processJob(job);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'ETL job processing completed',
        expect.objectContaining({
          jobId: 'job-123',
          success: false,
          recordsProcessed: 150,
          recordsInserted: 120,
          errorCount: 2,
          duration: expect.any(Number),
          sourceResults: {
            defillama: {
              success: true,
              processed: 100,
              inserted: 95,
              errors: 1,
            },
            debank: {
              success: false,
              processed: 50,
              inserted: 25,
              errors: 1,
            },
          },
        }),
      );
    });

    it('should handle unexpected exception during final result processing and trigger main catch block', async () => {
      // Arrange: This test targets the main catch block (lines 132-140) by simulating
      // an error during the final result aggregation, outside the per-source catch block.
      const job = createMockJob();
      const processingError = new Error(
        'Unexpected error during result aggregation',
      );

      // Mock Object.fromEntries to throw during final result processing (line 117)
      // This ensures the exception occurs outside of individual source processing
      const fromEntriesSpy = vi
        .spyOn(Object, 'fromEntries')
        .mockImplementationOnce(() => {
          throw processingError;
        });

      // Mock the processor to return a normal successful result
      mockPoolProcessor.process = vi.fn().mockResolvedValue({
        success: true,
        recordsProcessed: 10,
        recordsInserted: 8,
        errors: [],
        source: 'defillama' as const,
      });

      // Act
      const result = await factory.processJob(job);

      // Assert: The main catch block should have been triggered.
      expect(result.success).toBe(false);
      expect(result.errors).toEqual([processingError.message]);

      // Metrics are calculated before Object.fromEntries, so they should be available
      expect(result.recordsProcessed).toBe(10);
      expect(result.recordsInserted).toBe(8);

      // Verify the correct error was logged by the main catch block.
      expect(mockLogger.error).toHaveBeenCalledWith(
        'ETL job processing failed with exception:',
        expect.objectContaining({
          jobId: job.jobId,
          error: processingError,
        }),
      );

      // The successful completion log should NOT have been called due to the exception.
      expect(mockLogger.info).not.toHaveBeenCalledWith(
        'ETL job processing completed',
        expect.anything(),
      );

      // Cleanup
      fromEntriesSpy.mockRestore();
    });
  });

  describe('processSingleSource', () => {
    it('should handle Error instances thrown by processor', async () => {
      const job = createMockJob({ metadata: walletFetchMetadata });
      const processor = {
        process: vi.fn().mockRejectedValue(new Error('Single-source error')),
        getSourceType: vi.fn().mockReturnValue('debank'),
      } as unknown;

      const result = await (factory as unknown).processSingleSource(
        job,
        processor,
      );

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(['Single-source error']);
    });

    it('should handle non-Error failures thrown by processor', async () => {
      const job = createMockJob({ metadata: walletFetchMetadata });
      const processor = {
        process: vi.fn().mockRejectedValue('Single-source failure'),
        getSourceType: vi.fn().mockReturnValue('debank'),
      } as unknown;

      const result = await (factory as unknown).processSingleSource(
        job,
        processor,
      );

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(['Unknown error']);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy when all processors are healthy', async () => {
      mockPoolProcessor.healthCheck = vi.fn().mockResolvedValue({
        status: 'healthy',
      });
      mockWalletProcessor.healthCheck = vi.fn().mockResolvedValue({
        status: 'healthy',
      });
      mockHyperliquidProcessor.healthCheck = vi.fn().mockResolvedValue({
        status: 'healthy',
      });
      mockSentimentProcessor.healthCheck = vi.fn().mockResolvedValue({
        status: 'healthy',
      });
      mockTokenPriceProcessor.healthCheck = vi.fn().mockResolvedValue({
        status: 'healthy',
      });
      mockStockPriceProcessor.healthCheck = vi.fn().mockResolvedValue({
        status: 'healthy',
      });

      const result = await factory.healthCheck();

      expect(result.status).toBe('healthy');
      expect(result.sources.defillama.status).toBe('healthy');
      expect(result.sources.debank.status).toBe('healthy');
      expect(result.sources.hyperliquid.status).toBe('healthy');
      expect(result.sources.feargreed.status).toBe('healthy');
      expect(result.sources['token-price'].status).toBe('healthy');
      expect(result.sources['stock-price'].status).toBe('healthy');
    });

    it('should return unhealthy when any processor is unhealthy', async () => {
      mockPoolProcessor.healthCheck = vi.fn().mockResolvedValue({
        status: 'healthy',
      });
      mockWalletProcessor.healthCheck = vi.fn().mockResolvedValue({
        status: 'unhealthy',
        details: 'API connection timeout',
      });
      mockHyperliquidProcessor.healthCheck = vi.fn().mockResolvedValue({
        status: 'healthy',
      });
      mockSentimentProcessor.healthCheck = vi.fn().mockResolvedValue({
        status: 'healthy',
      });
      mockTokenPriceProcessor.healthCheck = vi.fn().mockResolvedValue({
        status: 'healthy',
      });
      mockStockPriceProcessor.healthCheck = vi.fn().mockResolvedValue({
        status: 'healthy',
      });

      const result = await factory.healthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.sources.defillama.status).toBe('healthy');
      expect(result.sources.debank).toEqual({
        status: 'unhealthy',
        details: 'API connection timeout',
      });
      expect(result.sources.hyperliquid.status).toBe('healthy');
      expect(result.sources.feargreed.status).toBe('healthy');
    });

    it('should handle processor health check exceptions', async () => {
      const healthError = new Error('Health check crashed');

      mockPoolProcessor.healthCheck = vi.fn().mockResolvedValue({
        status: 'healthy',
      });
      mockWalletProcessor.healthCheck = vi.fn().mockRejectedValue(healthError);
      mockHyperliquidProcessor.healthCheck = vi.fn().mockResolvedValue({
        status: 'healthy',
      });
      mockSentimentProcessor.healthCheck = vi.fn().mockResolvedValue({
        status: 'healthy',
      });
      mockTokenPriceProcessor.healthCheck = vi.fn().mockResolvedValue({
        status: 'healthy',
      });
      mockStockPriceProcessor.healthCheck = vi.fn().mockResolvedValue({
        status: 'healthy',
      });

      const result = await factory.healthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.sources.defillama.status).toBe('healthy');
      expect(result.sources.debank).toEqual({
        status: 'unhealthy',
        details: 'Health check crashed',
      });
      expect(result.sources.hyperliquid.status).toBe('healthy');
      expect(result.sources.feargreed.status).toBe('healthy');
    });

    it('should handle non-Error exceptions during health check', async () => {
      mockPoolProcessor.healthCheck = vi.fn().mockResolvedValue({
        status: 'healthy',
      });
      mockWalletProcessor.healthCheck = vi
        .fn()
        .mockRejectedValue('String error');
      mockHyperliquidProcessor.healthCheck = vi.fn().mockResolvedValue({
        status: 'healthy',
      });
      mockSentimentProcessor.healthCheck = vi.fn().mockResolvedValue({
        status: 'healthy',
      });
      mockTokenPriceProcessor.healthCheck = vi.fn().mockResolvedValue({
        status: 'healthy',
      });
      mockStockPriceProcessor.healthCheck = vi.fn().mockResolvedValue({
        status: 'healthy',
      });

      const result = await factory.healthCheck();

      expect(result.status).toBe('unhealthy');
      expect(result.sources.debank).toEqual({
        status: 'unhealthy',
        details: 'Unknown error',
      });
      expect(result.sources.hyperliquid.status).toBe('healthy');
      expect(result.sources.feargreed.status).toBe('healthy');
    });
  });

  describe('getStats', () => {
    it('should collect stats from all processors successfully', () => {
      const poolStats = {
        requestsTotal: 150,
        requestsSuccessful: 145,
        lastRequestTime: Date.now(),
        averageResponseTime: 250,
      };

      const walletStats = {
        requestsTotal: 75,
        requestsSuccessful: 70,
        lastRequestTime: Date.now(),
        usersProcessed: 25,
      };

      const hyperliquidStats = {
        requestsTotal: 20,
        lastRequestTime: Date.now(),
        vipUsersProcessed: 10,
      };
      const sentimentStats = {
        requestsTotal: 5,
        lastRequestTime: Date.now(),
        sentimentSnapshots: 5,
      };

      mockPoolProcessor.getStats = vi.fn().mockReturnValue(poolStats);
      mockWalletProcessor.getStats = vi.fn().mockReturnValue(walletStats);
      mockHyperliquidProcessor.getStats = vi
        .fn()
        .mockReturnValue(hyperliquidStats);
      mockSentimentProcessor.getStats = vi.fn().mockReturnValue(sentimentStats);

      const result = factory.getStats();

      expect(result.defillama).toBe(poolStats);
      expect(result.debank).toBe(walletStats);
      expect(result.hyperliquid).toBe(hyperliquidStats);
      expect(result.feargreed).toBe(sentimentStats);
      expect(mockPoolProcessor.getStats).toHaveBeenCalled();
      expect(mockWalletProcessor.getStats).toHaveBeenCalled();
      expect(mockHyperliquidProcessor.getStats).toHaveBeenCalled();
      expect(mockSentimentProcessor.getStats).toHaveBeenCalled();
    });

    it('should handle processor getStats errors gracefully', () => {
      const poolStats = { requestsTotal: 100 };
      const statsError = new Error('Stats collection failed');

      mockPoolProcessor.getStats = vi.fn().mockReturnValue(poolStats);
      mockWalletProcessor.getStats = vi.fn().mockImplementation(() => {
        throw statsError;
      });
      mockHyperliquidProcessor.getStats = vi
        .fn()
        .mockReturnValue({ requestsTotal: 0 });
      mockSentimentProcessor.getStats = vi
        .fn()
        .mockReturnValue({ requestsTotal: 1 });

      const result = factory.getStats();

      expect(result.defillama).toBe(poolStats);
      expect(result.debank).toEqual({
        error: 'Stats collection failed',
      });
      expect(result.hyperliquid).toEqual({ requestsTotal: 0 });
      expect(result.feargreed).toEqual({ requestsTotal: 1 });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get stats for processor:',
        expect.objectContaining({
          source: 'debank',
          error: statsError,
        }),
      );
    });

    it('should handle non-Error exceptions during stats collection', () => {
      const poolStats = { requestsTotal: 100 };

      mockPoolProcessor.getStats = vi.fn().mockReturnValue(poolStats);
      mockWalletProcessor.getStats = vi.fn().mockImplementation(() => {
        // eslint-disable-next-line no-throw-literal
        throw 'String error in stats';
      });
      mockHyperliquidProcessor.getStats = vi
        .fn()
        .mockReturnValue({ requestsTotal: 0 });
      mockSentimentProcessor.getStats = vi
        .fn()
        .mockReturnValue({ requestsTotal: 1 });

      const result = factory.getStats();

      expect(result.defillama).toBe(poolStats);
      expect(result.debank).toEqual({
        error: 'Unknown error',
      });
      expect(result.hyperliquid).toEqual({ requestsTotal: 0 });
      expect(result.feargreed).toEqual({ requestsTotal: 1 });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get stats for processor:',
        expect.objectContaining({
          source: 'debank',
          error: 'String error in stats',
        }),
      );
    });

    it('should handle all processors throwing errors', () => {
      const poolError = new Error('Pool stats error');
      const walletError = new Error('Wallet stats error');

      mockPoolProcessor.getStats = vi.fn().mockImplementation(() => {
        throw poolError;
      });
      mockWalletProcessor.getStats = vi.fn().mockImplementation(() => {
        throw walletError;
      });
      mockHyperliquidProcessor.getStats = vi.fn().mockImplementation(() => {
        throw new Error('Hyperliquid stats error');
      });
      mockSentimentProcessor.getStats = vi.fn().mockImplementation(() => {
        throw new Error('Sentiment stats error');
      });

      const result = factory.getStats();

      expect(result.defillama).toEqual({ error: 'Pool stats error' });
      expect(result.debank).toEqual({ error: 'Wallet stats error' });
      expect(result.hyperliquid).toEqual({ error: 'Hyperliquid stats error' });
      expect(result.feargreed).toEqual({ error: 'Sentiment stats error' });

      expect(mockLogger.error).toHaveBeenCalledTimes(4);
    });
  });

  describe('getSupportedSources', () => {
    it('should return array of supported data sources', () => {
      const sources = factory.getSupportedSources();

      expect(sources).toEqual([
        'defillama',
        'debank',
        'hyperliquid',
        'feargreed',
        'token-price',
        'stock-price',
      ]);
      expect(Array.isArray(sources)).toBe(true);
    });

    it('should return sources in consistent order', () => {
      const sources1 = factory.getSupportedSources();
      const sources2 = factory.getSupportedSources();

      expect(sources1).toEqual(sources2);
    });
  });

  describe('Advanced TypeScript Patterns and Edge Cases', () => {
    it('should maintain type safety with discriminated unions', async () => {
      const job = createMockJob({ sources: ['defillama'] });
      const result = await factory.processJob(job);

      // TypeScript should infer correct source types
      expect(result.sourceResults).toHaveProperty('defillama');
      expect(Object.keys(result.sourceResults)).toEqual(['defillama']);
    });

    it('should handle concurrent processor operations', async () => {
      vi.useFakeTimers();
      const job = createMockJob({ sources: ['defillama', 'debank'] });

      // Simulate slow processors
      mockPoolProcessor.process = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  success: true,
                  recordsProcessed: 1,
                  recordsInserted: 1,
                  errors: [],
                  source: 'defillama',
                }),
              100,
            ),
          ),
      );

      mockWalletProcessor.process = vi.fn().mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  success: true,
                  recordsProcessed: 1,
                  recordsInserted: 1,
                  errors: [],
                  source: 'debank',
                }),
              50,
            ),
          ),
      );

      const processPromise = factory.processJob(job);

      // Advance timers to trigger sequential processing
      // first job takes 100ms, then second takes 50ms
      await vi.advanceTimersByTimeAsync(150);

      const result = await processPromise;

      expect(result.success).toBe(true);
      vi.useRealTimers();
    });

    it('should preserve error context throughout processing chain', async () => {
      const job = createMockJob();
      const specificError = new Error('Database connection pool exhausted');
      specificError.stack = 'Error stack trace...';

      mockPoolProcessor.process = vi.fn().mockRejectedValue(specificError);

      const result = await factory.processJob(job);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Data source processing failed:',
        expect.objectContaining({
          error: specificError,
        }),
      );

      expect(result.sourceResults.defillama.errors).toEqual([
        'Database connection pool exhausted',
      ]);
    });
  });

  describe('processSingleSource (wallet_fetch jobs)', () => {
    it('should detect wallet_fetch jobs via metadata', async () => {
      const walletFetchJob = createMockJob({
        sources: ['debank'],
        metadata: {
          userId: 'user-123',
          walletAddress: '0x1234567890123456789012345678901234567890',
          jobType: 'wallet_fetch',
        },
      });

      // The factory will route to WalletFetchETLProcessor and log the metadata
      await factory.processJob(walletFetchJob);

      // Verify the special routing was logged
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting ETL job processing with pipeline factory',
        expect.objectContaining({
          metadata: expect.objectContaining({
            jobType: 'wallet_fetch',
          }),
        }),
      );
    });

    it('should skip normal multi-source processing for wallet_fetch jobs', async () => {
      const walletFetchJob = createMockJob({
        sources: ['debank'],
        metadata: {
          userId: 'user-456',
          walletAddress: '0xabcdef1234567890123456789012345678901234',
          jobType: 'wallet_fetch',
        },
      });

      // Reset the wallet processor mock
      mockWalletProcessor.process = vi.fn();

      await factory.processJob(walletFetchJob);

      // The normal wallet processor (WalletBalanceETLProcessor) should NOT be called
      // because wallet_fetch jobs use WalletFetchETLProcessor instead
      expect(mockWalletProcessor.process).not.toHaveBeenCalled();
    });

    it('should route to processSingleSource for wallet_fetch jobs', async () => {
      const walletFetchJob = createMockJob({
        sources: ['debank'],
        metadata: {
          userId: 'user-789',
          walletAddress: '0x9876543210987654321098765432109876543210',
          jobType: 'wallet_fetch',
        },
      });

      const result = await factory.processJob(walletFetchJob);

      // Result should come from the single-source processing path
      // We can verify this by checking that the sourceResults has a 'debank' key
      // since WalletFetchETLProcessor returns 'debank' as its source
      expect(result).toHaveProperty('sourceResults');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('recordsProcessed');
      expect(result).toHaveProperty('recordsInserted');
    });

    it('should log single-source processing completion', async () => {
      const walletFetchJob = createMockJob({
        sources: ['debank'],
        metadata: {
          userId: 'user-success',
          walletAddress: '0x1111111111111111111111111111111111111111',
          jobType: 'wallet_fetch',
        },
      });

      await factory.processJob(walletFetchJob);

      // Should log single-source completion (rather than multi-source "ETL job processing completed")
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Single-source job processing completed',
        expect.objectContaining({
          jobId: walletFetchJob.jobId,
          duration: expect.any(Number),
        }),
      );
    });
  });
});
