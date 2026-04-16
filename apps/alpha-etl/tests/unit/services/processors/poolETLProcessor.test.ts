import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ETLJob } from '../../../../src/types/index.js';
import type { PoolETLProcessor } from '../../../../src/modules/pool/processor.js';

// Hoist mocks
const {
    mockFetcher,
    mockTransformer,
    mockWriter
} = vi.hoisted(() => ({
    mockFetcher: {
        fetchAllPools: vi.fn(),
        healthCheck: vi.fn(),
        getRequestStats: vi.fn()
    },
    mockTransformer: {
        transformBatch: vi.fn()
    },
    mockWriter: {
        writePoolSnapshots: vi.fn()
    }
}));

const { mockValidateETLJob } = vi.hoisted(() => ({
    mockValidateETLJob: vi.fn()
}));

// Mock dependencies
vi.mock('../../../../src/modules/pool/fetcher.js', () => ({
    DeFiLlamaFetcher: class MockFetcher {
        constructor() { return mockFetcher; }
    }
}));

vi.mock('../../../../src/modules/pool/transformer.js', () => ({
    PoolDataTransformer: class MockTransformer {
        constructor() { return mockTransformer; }
    }
}));

vi.mock('../../../../src/modules/pool/writer.js', () => ({
    PoolWriter: class MockWriter {
        constructor() { return mockWriter; }
    }
}));

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

vi.mock('../../../../src/core/processors/validation.js', () => ({
    validateETLJob: (...args: unknown[]) => mockValidateETLJob(...args)
}));

describe('PoolETLProcessor', () => {
    let processor: PoolETLProcessor;

    beforeEach(async () => {
        vi.clearAllMocks();
        mockValidateETLJob.mockImplementation(() => undefined);
        const { PoolETLProcessor } = await import('../../../../src/modules/pool/processor.js');
        processor = new PoolETLProcessor();
    });

    const mockJob: ETLJob = {
        jobId: 'test-job-123',
        trigger: 'scheduled',
        sources: ['defillama'],
        filters: { minTvl: 1000 },
        createdAt: new Date(),
        status: 'pending'
    };

    describe('process', () => {
        it('should successfully process data flow', async () => {
            const rawData = [{ id: '1' }];
            const transformedData = [{ id: '1', chain: 'eth' }];

            mockFetcher.fetchAllPools.mockResolvedValue(rawData);
            mockTransformer.transformBatch.mockReturnValue(transformedData);
            mockWriter.writePoolSnapshots.mockResolvedValue({
                success: true,
                recordsInserted: 1,
                errors: []
            });

            const result = await processor.process(mockJob);

            expect(result.success).toBe(true);
            expect(result.recordsProcessed).toBe(1);
            expect(result.recordsInserted).toBe(1);

            expect(mockFetcher.fetchAllPools).toHaveBeenCalledWith(1000);
            expect(mockTransformer.transformBatch).toHaveBeenCalledWith(rawData, 'defillama');
            expect(mockWriter.writePoolSnapshots).toHaveBeenCalledWith(transformedData, 'defillama');
        });

        it('should handle empty fetch result', async () => {
            mockFetcher.fetchAllPools.mockResolvedValue([]);

            const result = await processor.process(mockJob);

            expect(result.success).toBe(true);
            expect(result.recordsProcessed).toBe(0);
            expect(mockTransformer.transformBatch).not.toHaveBeenCalled();
        });

        it('should handle empty transform result', async () => {
            mockFetcher.fetchAllPools.mockResolvedValue([{ id: '1' }]);
            mockTransformer.transformBatch.mockReturnValue([]);

            const result = await processor.process(mockJob);

            expect(result.success).toBe(true);
            expect(result.recordsProcessed).toBe(1);
            expect(result.recordsInserted).toBe(0);
            expect(mockWriter.writePoolSnapshots).not.toHaveBeenCalled();
        });

        it('should use tvlThreshold of 0 when filters are undefined', async () => {
            const jobWithoutFilters: ETLJob = {
                jobId: 'test-job-no-filters',
                trigger: 'scheduled',
                sources: ['defillama'],
                createdAt: new Date(),
                status: 'pending'
                // no filters property
            };
            mockFetcher.fetchAllPools.mockResolvedValue([]);

            await processor.process(jobWithoutFilters);

            expect(mockFetcher.fetchAllPools).toHaveBeenCalledWith(0);
        });

        it('should return unknown error when validation throws non-Error', async () => {
            mockValidateETLJob.mockImplementationOnce(() => {
                throw 'Invalid job payload';
            });

            const result = await processor.process(mockJob);

            expect(result.success).toBe(false);
            expect(result.errors).toContain('Unknown error');
        });
    });

    describe('healthCheck', () => {
        it('should delegate to fetcher health check', async () => {
            mockFetcher.healthCheck.mockResolvedValue({ status: 'healthy', details: 'OK' });

            const result = await processor.healthCheck();

            expect(result.status).toBe('healthy');
            expect(result.details).toBe('OK');
        });

        it('should handle unhealthy status', async () => {
            mockFetcher.healthCheck.mockResolvedValue({ status: 'unhealthy', details: 'Down' });

            const result = await processor.healthCheck();

            expect(result.status).toBe('unhealthy');
            expect(result.details).toBe('Down');
        });

        it('should catch errors', async () => {
            mockFetcher.healthCheck.mockRejectedValue(new Error('Connection failed'));

            const result = await processor.healthCheck();

            expect(result.status).toBe('unhealthy');
            expect(result.details).toBe('Connection failed');
        });
    });

    describe('getStats', () => {
        it('should return fetcher stats', () => {
            const stats = { requestCount: 5 };
            mockFetcher.getRequestStats.mockReturnValue(stats);

            const result = processor.getStats();

            expect(result).toHaveProperty('defillama', stats);
        });
    });

    describe('getSourceType', () => {
        it('should return defillama', () => {
            expect(processor.getSourceType()).toBe('defillama');
        });
    });
});
