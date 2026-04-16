/**
 * Comprehensive unit tests for WalletFetchETLProcessor
 * Tests the single-wallet fetch ETL processor used for account-engine webhook requests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WalletFetchETLProcessor } from '../../../../src/modules/wallet/fetchProcessor.js';
import type { ETLJob } from '../../../../src/types/index.js';

// Hoisted mocks
const { mockLogger, mockDebankFetcher, mockTransformer, mockWriter, mockPortfolioTransformer, mockPortfolioWriter } = vi.hoisted(() => ({
    mockLogger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    },
    mockDebankFetcher: {
        fetchWalletTokenList: vi.fn(),
        fetchComplexProtocolList: vi.fn(),
        healthCheck: vi.fn(),
        getRequestStats: vi.fn(),
    },
    mockTransformer: {
        transformBatch: vi.fn(),
    },
    mockWriter: {
        writeWalletBalanceSnapshots: vi.fn(),
    },
    mockPortfolioTransformer: {
        transformBatch: vi.fn(),
    },
    mockPortfolioWriter: {
        writeSnapshots: vi.fn(),
    },
}));

vi.mock('../../../../src/utils/logger.js', () => ({
    logger: mockLogger,
}));

vi.mock('../../../../src/modules/wallet/fetcher.js', () => ({
    DeBankFetcher: class {
        fetchWalletTokenList = mockDebankFetcher.fetchWalletTokenList;
        fetchComplexProtocolList = mockDebankFetcher.fetchComplexProtocolList;
        healthCheck = mockDebankFetcher.healthCheck;
        getRequestStats = mockDebankFetcher.getRequestStats;
    },
}));

vi.mock('../../../../src/modules/wallet/balanceTransformer.js', () => ({
    WalletBalanceTransformer: class {
        transformBatch = mockTransformer.transformBatch;
    },
}));

vi.mock('../../../../src/modules/wallet/portfolioTransformer.js', () => ({
    DeBankPortfolioTransformer: class {
        transformBatch = mockPortfolioTransformer.transformBatch;
    },
}));

vi.mock('../../../../src/modules/wallet/balanceWriter.js', () => ({
    WalletBalanceWriter: class {
        writeWalletBalanceSnapshots = mockWriter.writeWalletBalanceSnapshots;
    },
}));

vi.mock('../../../../src/modules/wallet/portfolioWriter.js', () => ({
    PortfolioItemWriter: class {
        writeSnapshots = mockPortfolioWriter.writeSnapshots;
    },
}));

// Helper to create mock jobs
const createMockJob = (overrides: Partial<ETLJob> = {}): ETLJob => ({
    jobId: 'wallet-fetch-job-123',
    trigger: 'manual',
    sources: ['debank'],
    createdAt: new Date(),
    status: 'processing',
    metadata: {
        userId: 'user-123',
        walletAddress: '0x1234567890123456789012345678901234567890',
        jobType: 'wallet_fetch'
    },
    ...overrides
});

describe('WalletFetchETLProcessor', () => {
    let processor: WalletFetchETLProcessor;

    beforeEach(() => {
        vi.clearAllMocks();
        processor = new WalletFetchETLProcessor();
    });

    describe('process()', () => {
        it('should successfully process a wallet fetch job', async () => {
            const job = createMockJob();

            // Mock DeBank responses
            mockDebankFetcher.fetchWalletTokenList.mockResolvedValue([
                { id: 'eth', amount: 1.5, chain: 'eth', symbol: 'ETH', price: 2000 },
                { id: 'usdc', amount: 1000, chain: 'eth', symbol: 'USDC', price: 1 }
            ]);
            mockDebankFetcher.fetchComplexProtocolList.mockResolvedValue([
                { id: 'aave', name: 'Aave', chain: 'eth' }
            ]);

            // Mock transformers
            mockTransformer.transformBatch.mockReturnValue([
                { user_wallet_address: job.metadata?.walletAddress, token_address: 'eth', amount: 1.5 },
                { user_wallet_address: job.metadata?.walletAddress, token_address: 'usdc', amount: 1000 }
            ]);
            mockPortfolioTransformer.transformBatch.mockReturnValue([
                { wallet_address: job.metadata?.walletAddress, protocol_id: 'aave' }
            ]);

            // Mock writers
            mockWriter.writeWalletBalanceSnapshots.mockResolvedValue({
                success: true,
                recordsInserted: 2,
                errors: []
            });
            mockPortfolioWriter.writeSnapshots.mockResolvedValue({
                success: true,
                recordsInserted: 1,
                errors: []
            });

            const result = await processor.process(job);

            expect(result.success).toBe(true);
            expect(result.recordsProcessed).toBe(3); // 2 tokens + 1 protocol
            expect(result.recordsInserted).toBe(3); // 2 + 1
            expect(result.source).toBe('debank');
            expect(result.errors).toHaveLength(0);
        });

        it('should return error when wallet address is missing', async () => {
            const job = createMockJob({ metadata: undefined });

            const result = await processor.process(job);

            expect(result.success).toBe(false);
            expect(result.recordsProcessed).toBe(0);
            expect(result.errors).toContain('Wallet address missing from job metadata');
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Wallet address missing from job metadata',
                { jobId: job.jobId }
            );
        });

        it('should handle DeBank fetch failure gracefully', async () => {
            const job = createMockJob();

            mockDebankFetcher.fetchWalletTokenList.mockRejectedValue(new Error('API timeout'));

            const result = await processor.process(job);

            expect(result.success).toBe(false);
            expect(result.recordsProcessed).toBe(0);
            expect(result.errors).toContain('API timeout');
        });

        it('should handle invalid DeBank response', async () => {
            const job = createMockJob();

            // Return non-array responses
            mockDebankFetcher.fetchWalletTokenList.mockResolvedValue(null);
            mockDebankFetcher.fetchComplexProtocolList.mockResolvedValue({ error: 'invalid' });

            mockTransformer.transformBatch.mockReturnValue([]);
            mockWriter.writeWalletBalanceSnapshots.mockResolvedValue({
                success: true,
                recordsInserted: 0,
                errors: []
            });
            mockPortfolioWriter.writeSnapshots.mockResolvedValue({
                success: true,
                recordsInserted: 0,
                errors: []
            });

            const result = await processor.process(job);

            expect(result.success).toBe(true);
            expect(result.recordsProcessed).toBe(0);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                'DeBank fetch failed - invalid response',
                expect.any(Object)
            );
        });

        it('should handle empty transformation result', async () => {
            const job = createMockJob();

            mockDebankFetcher.fetchWalletTokenList.mockResolvedValue([]);
            mockDebankFetcher.fetchComplexProtocolList.mockResolvedValue([]);
            mockTransformer.transformBatch.mockReturnValue([]);
            mockPortfolioTransformer.transformBatch.mockReturnValue([]);
            mockWriter.writeWalletBalanceSnapshots.mockResolvedValue({
                success: true,
                recordsInserted: 0,
                errors: []
            });
            mockPortfolioWriter.writeSnapshots.mockResolvedValue({
                success: true,
                recordsInserted: 0,
                errors: []
            });

            const result = await processor.process(job);

            expect(result.success).toBe(true);
            expect(result.recordsInserted).toBe(0);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                'No valid data after wallet balance transformation',
                { jobId: job.jobId }
            );
        });

        it('should aggregate errors from both writers', async () => {
            const job = createMockJob();

            mockDebankFetcher.fetchWalletTokenList.mockResolvedValue([{ id: 'eth' }]);
            mockDebankFetcher.fetchComplexProtocolList.mockResolvedValue([{ id: 'aave' }]);
            mockTransformer.transformBatch.mockReturnValue([{ token: 'eth' }]);
            mockPortfolioTransformer.transformBatch.mockReturnValue([{ protocol: 'aave' }]);

            mockWriter.writeWalletBalanceSnapshots.mockResolvedValue({
                success: true,
                recordsInserted: 1,
                errors: ['Balance write warning']
            });
            mockPortfolioWriter.writeSnapshots.mockResolvedValue({
                success: true,
                recordsInserted: 1,
                errors: ['Portfolio write warning']
            });

            const result = await processor.process(job);

            expect(result.errors).toContain('Balance write warning');
            expect(result.errors).toContain('Portfolio write warning');
        });

        it('should default missing writer errors to empty array', async () => {
            const job = createMockJob();

            mockDebankFetcher.fetchWalletTokenList.mockResolvedValue([{ id: 'eth' }]);
            mockDebankFetcher.fetchComplexProtocolList.mockResolvedValue([{ id: 'aave' }]);
            mockTransformer.transformBatch.mockReturnValue([{ token: 'eth' }]);
            mockPortfolioTransformer.transformBatch.mockReturnValue([{ protocol: 'aave' }]);

            mockWriter.writeWalletBalanceSnapshots.mockResolvedValue({
                success: true,
                recordsInserted: 1,
                errors: ''
            } as unknown);
            mockPortfolioWriter.writeSnapshots.mockResolvedValue({
                success: true,
                recordsInserted: 1,
                errors: ''
            } as unknown);

            const result = await processor.process(job);

            expect(result.success).toBe(true);
            expect(result.errors).toEqual([]);
        });

        it('should log generic error when catch block gets a non-validation error', async () => {
            const job = createMockJob({
                metadata: {
                    walletAddress: '0x1234567890123456789012345678901234567890',
                    userId: '',     // empty string fails z.string().min(1)
                    jobType: 'wallet_fetch',
                },
            });

            const result = await processor.process(job);

            expect(result.success).toBe(false);
            expect(result.errors).toContain('Invalid wallet_fetch metadata');
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Wallet fetch ETL job failed',
                expect.objectContaining({ jobId: job.jobId })
            );
        });

        it('should handle non-Error exceptions during processing', async () => {
            const job = createMockJob();

            mockDebankFetcher.fetchWalletTokenList.mockRejectedValue('Non-error failure');

            const result = await processor.process(job);

            expect(result.success).toBe(false);
            expect(result.errors).toContain('Unknown error');
        });
    });

    describe('healthCheck()', () => {
        it('should return healthy when DeBank is healthy', async () => {
            mockDebankFetcher.healthCheck.mockResolvedValue({ status: 'healthy' });

            const result = await processor.healthCheck();

            expect(result.status).toBe('healthy');
        });

        it('should return unhealthy when DeBank is unhealthy', async () => {
            mockDebankFetcher.healthCheck.mockResolvedValue({
                status: 'unhealthy',
                details: 'API rate limited'
            });

            const result = await processor.healthCheck();

            expect(result.status).toBe('unhealthy');
            expect(result.details).toBe('API rate limited');
        });

        it('should omit details when DeBank does not provide them', async () => {
            mockDebankFetcher.healthCheck.mockResolvedValue({
                status: 'unhealthy'
            });

            const result = await processor.healthCheck();

            expect(result.status).toBe('unhealthy');
            expect(result.details).toBeUndefined();
        });

        it('should handle health check errors', async () => {
            mockDebankFetcher.healthCheck.mockRejectedValue(new Error('Connection refused'));

            const result = await processor.healthCheck();

            expect(result.status).toBe('unhealthy');
            expect(result.details).toBe('Connection refused');
        });

        it('should handle non-Error health check failures', async () => {
            mockDebankFetcher.healthCheck.mockRejectedValue('Network down');

            const result = await processor.healthCheck();

            expect(result.status).toBe('unhealthy');
            expect(result.details).toBe('Unknown error');
        });
    });

    describe('getStats()', () => {
        it('should return DeBank request stats', () => {
            const mockStats = { totalRequests: 100, successRate: 0.95 };
            mockDebankFetcher.getRequestStats.mockReturnValue(mockStats);

            const stats = processor.getStats();

            expect(stats).toEqual({ debank: mockStats });
        });
    });

    describe('getSourceType()', () => {
        it('should return debank as source type', () => {
            expect(processor.getSourceType()).toBe('debank');
        });
    });
});
