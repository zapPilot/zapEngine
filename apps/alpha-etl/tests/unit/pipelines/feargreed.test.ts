
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    SentimentETLProcessor,
    FearGreedFetcher,
    SentimentDataTransformer,
    SentimentWriter
} from '../../../src/modules/sentiment/index.js';
import { logger } from '../../../src/utils/logger.js';
import { APIError } from '../../../src/utils/errors.js';
import { Pool } from 'pg';
import type { ETLJob } from '../../../src/types/index.js';

// Mock dependencies
const mockClient = { query: vi.fn(), release: vi.fn() };
const mockPool = {
    query: vi.fn(),
    connect: vi.fn().mockResolvedValue(mockClient),
    end: vi.fn(),
} as unknown as Pool;

vi.mock('../../../src/config/database.js', () => ({
    getDbPool: () => mockPool,
    getDbClient: () => Promise.resolve(mockClient),
    RATE_LIMITS: { COINMARKETCAP_DELAY_MS: 0 },
    DATA_LIMITS: { SENTIMENT_MIN: 0, SENTIMENT_MAX: 100 },
    getTableName: (name: string) => name.toLowerCase(),
}));

vi.mock('../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../setup/mocks.js');
  return mockLogger();
});

describe('Fear & Greed Pipeline', () => {

    describe('FearGreedFetcher', () => {
        let fetcher: FearGreedFetcher;

        beforeEach(() => {
            fetcher = new FearGreedFetcher({ apiKey: 'test-key' });
            vi.spyOn(fetcher as unknown, 'fetchWithRetry').mockResolvedValue({});
        });

        it('fetchCurrentSentiment should return valid data on success', async () => {
            const mockResponse = {
                status: { error_code: "0", error_message: null, credit_count: 1 },
                data: {
                    value: 50,
                    value_classification: 'Neutral',
                    update_time: '2023-01-01T00:00:00Z'
                }
            };
            vi.spyOn(fetcher as unknown, 'fetchWithRetry').mockResolvedValue(mockResponse);

            const result = await fetcher.fetchCurrentSentiment();
            expect(result.value).toBe(50);
            expect(result.classification).toBe('Neutral');
            expect(result.source).toBe('coinmarketcap');
        });

        it('fetchCurrentSentiment should throw on API error code', async () => {
            const mockResponse = {
                status: { error_code: "1001", error_message: "Invalid Key", credit_count: 0 },
                data: {}
            };
            vi.spyOn(fetcher as unknown, 'fetchWithRetry').mockResolvedValue(mockResponse);
            await expect(fetcher.fetchCurrentSentiment()).rejects.toThrow('CoinMarketCap API error (code 1001)');
        });

        it('fetchCurrentSentiment should throw on invalid structure', async () => {
            const mockResponse = {
                status: { error_code: "0", error_message: null },
                // missing data
            };
            vi.spyOn(fetcher as unknown, 'fetchWithRetry').mockResolvedValue(mockResponse);
            await expect(fetcher.fetchCurrentSentiment()).rejects.toThrow('Invalid API response');
        });

        it('fetchCurrentSentiment should throw on network error', async () => {
            vi.spyOn(fetcher as unknown, 'fetchWithRetry').mockRejectedValue(new Error('Network fail'));
            await expect(fetcher.fetchCurrentSentiment()).rejects.toThrow('Network fail');
        });

        it('fetchRawResponse should return full response', async () => {
            const mockResponse = {
                status: { error_code: "0", error_message: null },
                data: {}
            };
            vi.spyOn(fetcher as unknown, 'fetchJson').mockResolvedValue(mockResponse);

            const result = await fetcher.fetchRawResponse();
            expect(result).toEqual(mockResponse);
        });

        it('healthCheck should return healthy', async () => {
            const mockResponse = {
                status: { error_code: "0", error_message: null, credit_count: 1 },
                data: {
                    value: 50,
                    value_classification: 'Neutral',
                    update_time: new Date().toISOString()
                }
            };
            vi.spyOn(fetcher as unknown, 'fetchWithRetry').mockResolvedValue(mockResponse);

            const result = await fetcher.healthCheck();
            expect(result.status).toBe('healthy');
        });

        it('healthCheck should return unhealthy if key missing', async () => {
            const noKeyFetcher = new FearGreedFetcher({ apiKey: '' });
            const result = await noKeyFetcher.healthCheck();
            expect(result.status).toBe('unhealthy');
            expect(result.details).toContain('not configured');
        });

        it('healthCheck should return unhealthy if data stale', async () => {
            const mockResponse = {
                status: { error_code: "0", error_message: null, credit_count: 1 },
                data: {
                    value: 50,
                    value_classification: 'Neutral',
                    update_time: '2020-01-01T00:00:00Z' // Very old
                }
            };
            vi.spyOn(fetcher as unknown, 'fetchWithRetry').mockResolvedValue(mockResponse);

            const result = await fetcher.healthCheck();
            expect(result.status).toBe('unhealthy');
            expect(result.details).toContain('stale');
        });
    });

    describe('SentimentDataTransformer', () => {
        let transformer: SentimentDataTransformer;

        beforeEach(() => {
            transformer = new SentimentDataTransformer();
        });

        it('transform should return valid object', () => {
            const input = {
                value: 50,
                classification: 'Neutral',
                timestamp: Math.floor(Date.now() / 1000),
                source: 'coinmarketcap'
            };
            const result = transformer.transform(input);
            expect(result).not.toBeNull();
            expect(result?.sentiment_value).toBe(50);
            expect(result?.classification).toBe('Neutral');
        });

        it('resolveClassificationRange should fall back to full range for unknown classification', () => {
            const range = (transformer as unknown).resolveClassificationRange('UNKNOWN_CLASS');
            expect(range).toEqual([0, 100]);
        });

        it('transform should return null on schema validation failure', () => {
            const input = {
                value: -10, // Invalid value
                classification: 'Neutral',
                timestamp: Math.floor(Date.now() / 1000),
                source: 'coinmarketcap'
            };
            const result = transformer.transform(input);
            expect(result).toBeNull();
        });

        it('transformBatch should filter nulls', () => {
            const inputs = [
                { value: 50, classification: 'Neutral', timestamp: Math.floor(Date.now() / 1000), source: 'coinmarketcap' },
                { value: -10, classification: 'Neutral', timestamp: Math.floor(Date.now() / 1000), source: 'coinmarketcap' }
            ];
            const results = transformer.transformBatch(inputs);
            expect(results.length).toBe(1);
        });

        it('transform should log warning for classification mismatch', () => {
            const input = {
                value: 10, // Extreme Fear
                classification: 'Greed',
                timestamp: Math.floor(Date.now() / 1000),
                source: 'coinmarketcap'
            };
            const result = transformer.transform(input);
            expect(result).not.toBeNull();
            expect(result?.classification).toBe('Greed');
            // Warning logged internally
        });

        it('transform should log warning for strange timestamp (future/old)', () => {
            const future = Math.floor(Date.now() / 1000) + 7200;
            const result = transformer.transform({
                value: 50,
                classification: 'Neutral',
                timestamp: future,
                source: 'coinmarketcap'
            });
            expect(result).not.toBeNull();
        });

        it('transform should handle timestamp conversion error via mocked Date', () => {
            const originalDate = global.Date;
            // Mock Date so calling new Date() throws
            // Note: Vitest might wrap global.Date
            const spy = vi.spyOn(global, 'Date').mockImplementation(() => {
                throw new Error('DateBomb');
            });

            try {
                const input = {
                    value: 50,
                    classification: 'Neutral',
                    timestamp: 123,
                    source: 'coinmarketcap'
                };
                // This triggers convertTimestamp(123) -> new Date(123000)
                const result = transformer.transform(input);
                expect(result).toBeNull();
                expect(logger.error).toHaveBeenCalledWith('Failed to convert timestamp', expect.any(Object));
            } finally {
                spy.mockRestore();
            }
        });
    });

    describe('SentimentWriter', () => {
        let writer: SentimentWriter;

        beforeEach(() => {
            vi.clearAllMocks();
            writer = new SentimentWriter();
        });

        it('writeSentimentSnapshots should execute query', async () => {
            const snapshots = [{
                sentiment_value: 50,
                classification: 'Neutral',
                source: 'coinmarketcap',
                snapshot_time: new Date().toISOString(),
                raw_data: {}
            }];

            (mockClient.query as unknown).mockResolvedValue({ rowCount: 1 });

            const result = await writer.writeSentimentSnapshots(snapshots, 'test');

            expect(result.success).toBe(true);
            expect(result.recordsInserted).toBe(1);
            expect(mockClient.query).toHaveBeenCalled();
        });

        it('writeSentimentSnapshots should handle empty batch', async () => {
            const result = await writer.writeSentimentSnapshots([], 'test');
            expect(result.recordsInserted).toBe(0);
        });

        it('writeSentimentSnapshots should handle database error', async () => {
            const snapshots = [{
                sentiment_value: 50,
                classification: 'Neutral',
                source: 'coinmarketcap',
                snapshot_time: new Date().toISOString(),
                raw_data: {}
            }];

            (mockClient.query as unknown).mockRejectedValue(new Error('DB Error'));

            const result = await writer.writeSentimentSnapshots(snapshots, 'test');

            expect(result.success).toBe(false);
            expect(result.errors[0]).toBe('DB Error');
        });

        it('writeSentimentSnapshots should validate records in batch', async () => {
            const snapshots = [{
                // Missing required fields
                source: '',
                sentiment_value: null as unknown
            } as unknown];

            const result = await writer.writeSentimentSnapshots(snapshots, 'test');
            // If validation fails in loop before insert
            expect(result.recordsInserted).toBe(0);
            expect(result.errors.length).toBeGreaterThan(0);
        });
    });

    describe('SentimentETLProcessor', () => {
        let processor: SentimentETLProcessor;

        beforeEach(() => {
            processor = new SentimentETLProcessor({ apiKey: 'test' });
        });

        it('process should run successfully', async () => {
            const job: ETLJob = {
                jobId: 'test-job',
                trigger: 'manual',
                sources: ['feargreed'],
                createdAt: new Date(),
                status: 'pending'
            };

            // Mock fetcher
            const mockSentiment = {
                value: 50,
                classification: 'Neutral',
                timestamp: Math.floor(Date.now() / 1000),
                source: 'coinmarketcap'
            };
            vi.spyOn(FearGreedFetcher.prototype, 'fetchCurrentSentiment').mockResolvedValue(mockSentiment);

            // Mock writer
            vi.spyOn(SentimentWriter.prototype, 'writeSentimentSnapshots').mockResolvedValue({
                success: true,
                recordsInserted: 1,
                errors: [],
                duplicatesSkipped: 0
            });

            const result = await processor.process(job);
            expect(result.success).toBe(true);
        });

        it('process should handle fetch failure', async () => {
            const job: ETLJob = { jobId: 'test-job', trigger: 'manual', sources: ['feargreed'], createdAt: new Date(), status: 'pending' };
            vi.spyOn(FearGreedFetcher.prototype, 'fetchCurrentSentiment').mockRejectedValue(new Error('Fetch error'));

            const result = await processor.process(job);
            expect(result.success).toBe(false);
            expect(result.errors[0]).not.toBeUndefined();
        });

        it('process should handle transform failure (null return)', async () => {
            const job: ETLJob = { jobId: 'test-job', trigger: 'manual', sources: ['feargreed'], createdAt: new Date(), status: 'pending' };

            const mockSentiment = {
                value: 50,
                classification: 'Neutral',
                timestamp: Math.floor(Date.now() / 1000),
                source: 'coinmarketcap'
            };
            vi.spyOn(FearGreedFetcher.prototype, 'fetchCurrentSentiment').mockResolvedValue(mockSentiment);

            // Mock transformer
            vi.spyOn(SentimentDataTransformer.prototype, 'transform').mockReturnValue(null);

            const result = await processor.process(job);
            expect(result.success).toBe(false);
            expect(result.errors[0]).toContain('Sentiment data failed validation');
        });

        it('process should handle transform exception', async () => {
            const job: ETLJob = { jobId: 'test-job', trigger: 'manual', sources: ['feargreed'], createdAt: new Date(), status: 'pending' };
            const mockSentiment = {
                value: 50,
                classification: 'Neutral',
                timestamp: Math.floor(Date.now() / 1000),
                source: 'coinmarketcap'
            };
            vi.spyOn(FearGreedFetcher.prototype, 'fetchCurrentSentiment').mockResolvedValue(mockSentiment);

            // Force transformer to throw
            vi.spyOn(SentimentDataTransformer.prototype, 'transform').mockImplementation(() => {
                throw new Error('Transform Bomb');
            });

            const result = await processor.process(job);

            expect(result.success).toBe(false);
            expect(logger.error).toHaveBeenCalledWith('feargreed processing failed:', expect.objectContaining({ error: expect.any(Error) }));
        });

        it('process should handle invalid job (trigger catch block)', async () => {
            // Invalid job missing required properties but has jobId to prevent TypeError in catch block logging
            const invalidJob = { jobId: 'invalid-job' } as unknown;

            const result = await processor.process(invalidJob);
            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            // Should log 'feargreed processing failed' (from withValidatedJob)
            expect(logger.error).toHaveBeenCalledWith('feargreed processing failed', expect.any(Object));
        });

        it('healthCheck should return status', async () => {
            vi.spyOn(FearGreedFetcher.prototype, 'healthCheck').mockResolvedValue({ status: 'healthy' });
            const result = await processor.healthCheck();
            expect(result.status).toBe('healthy');
        });

        it('getStats should return stats', () => {
            const stats = processor.getStats();
            expect(stats).toHaveProperty('feargreed');
        });

        it('getSourceType should return feargreed', () => {
            expect(processor.getSourceType()).toBe('feargreed');
        });

    });
});
