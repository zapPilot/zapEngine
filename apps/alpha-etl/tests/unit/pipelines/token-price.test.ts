/* eslint-disable max-lines-per-function */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    TokenPriceETLProcessor,
    CoinGeckoFetcher,
    TokenPriceWriter,
    TokenPriceDmaService
} from '../../../src/modules/token-price/index.js';
import { APIError } from '../../../src/utils/errors.js';
import { Pool } from 'pg';
import type { ETLJob } from '../../../src/types/index.js';

// Mock dependencies
const mockPool = {
    query: vi.fn(),
    connect: vi.fn(),
    end: vi.fn(),
} as unknown as Pool;

const mockClient = {
    query: mockPool.query,
    release: vi.fn(),
};
(mockPool.connect as ReturnType<typeof vi.fn>).mockResolvedValue(mockClient);

vi.mock('../../../src/config/database.js', () => ({
    getDbPool: () => mockPool,
    getDbClient: async () => mockClient,
    RATE_LIMITS: { COINGECKO_DELAY_MS: 0 },
    getTableName: (name: string) => name.toLowerCase(),
}));

vi.mock('../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../setup/mocks.js');
  return mockLogger();
});

// Mock validation module
vi.mock('../../../src/core/processors/validation.js', () => ({
    validateETLJob: vi.fn(),
}));
import { validateETLJob } from '../../../src/core/processors/validation.js';

describe('BTC Price Pipeline', () => {
    let pipeline: TokenPriceETLProcessor;

    beforeEach(() => {
        vi.clearAllMocks();
        pipeline = new TokenPriceETLProcessor();
    });

    describe('CoinGeckoFetcher', () => {
        let fetcher: CoinGeckoFetcher;

        beforeEach(() => {
            fetcher = new CoinGeckoFetcher();
            vi.spyOn(fetcher as unknown, 'fetchWithRetry').mockResolvedValue({});
        });

        // --- fetchCurrentPrice tests ---
        it('fetchCurrentPrice should return valid data on success', async () => {
            const mockResponse = {
                bitcoin: {
                    usd: 50000,
                    usd_market_cap: 1000000000,
                    usd_24h_vol: 50000000
                }
            };
            vi.spyOn(fetcher as unknown, 'fetchWithRetry').mockResolvedValue(mockResponse);

            const result = await fetcher.fetchCurrentPrice();
            expect(result.priceUsd).toBe(50000);
            expect(result.tokenSymbol).toBe('BTC');
            expect(result.source).toBe('coingecko');
        });

        it('fetchCurrentPrice should default market_cap and volume to 0 when null', async () => {
            const mockResponse = {
                bitcoin: {
                    usd: 50000,
                    usd_market_cap: null,
                    usd_24h_vol: null
                }
            };
            vi.spyOn(fetcher as unknown, 'fetchWithRetry').mockResolvedValue(mockResponse);

            const result = await fetcher.fetchCurrentPrice();
            expect(result.priceUsd).toBe(50000);
            expect(result.marketCapUsd).toBe(0);
            expect(result.volume24hUsd).toBe(0);
        });

        it('fetchCurrentPrice should throw if required fields missing', async () => {
            const mockResponse = {}; // Empty object
            vi.spyOn(fetcher as unknown, 'fetchWithRetry').mockResolvedValue(mockResponse);
            await expect(fetcher.fetchCurrentPrice()).rejects.toThrow('missing bitcoin.usd field');
        });

        it('fetchCurrentPrice should throw on invalid response format', async () => {
            vi.spyOn(fetcher as unknown, 'fetchWithRetry').mockResolvedValue(null);
            await expect(fetcher.fetchCurrentPrice()).rejects.toThrow('Invalid CoinGecko response');
        });

        it('fetchCurrentPrice should throw on API error', async () => {
            const apiError = new APIError('Rate limited', 429);
            vi.spyOn(fetcher as unknown, 'fetchWithRetry').mockRejectedValue(apiError);
            await expect(fetcher.fetchCurrentPrice()).rejects.toThrow('CoinGecko API error');
        });

        it('fetchCurrentPrice should propagate unknown errors', async () => {
            const error = new Error('Network error');
            vi.spyOn(fetcher as unknown, 'fetchWithRetry').mockRejectedValue(error);
            await expect(fetcher.fetchCurrentPrice()).rejects.toThrow('Network error');
        });

        // --- fetchHistoricalPrice tests ---
        it('fetchHistoricalPrice should parse data correctly', async () => {
            const mockResponse = {
                id: 'bitcoin',
                symbol: 'btc',
                name: 'Bitcoin',
                market_data: {
                    current_price: { usd: 45000 },
                    market_cap: { usd: 900000000 },
                    total_volume: { usd: 40000000 }
                }
            };
            vi.spyOn(fetcher as unknown, 'fetchWithRetry').mockResolvedValue(mockResponse);

            const result = await fetcher.fetchHistoricalPrice('01-01-2023');
            expect(result.priceUsd).toBe(45000);
            expect(result.timestamp.getFullYear()).toBe(2023);
        });

        it('fetchHistoricalPrice should default market_cap and volume to 0 when missing', async () => {
            const mockResponse = {
                id: 'bitcoin',
                symbol: 'btc',
                name: 'Bitcoin',
                market_data: {
                    current_price: { usd: 45000 }
                    // no market_cap or total_volume
                }
            };
            vi.spyOn(fetcher as unknown, 'fetchWithRetry').mockResolvedValue(mockResponse);

            const result = await fetcher.fetchHistoricalPrice('01-01-2023');
            expect(result.priceUsd).toBe(45000);
            expect(result.marketCapUsd).toBe(0);
            expect(result.volume24hUsd).toBe(0);
        });

        it('fetchHistoricalPrice should throw on invalid response format (schema fail)', async () => {
            const mockResponse = {
                id: 'bitcoin',
                // missing symbol, name, market_data
            };
            vi.spyOn(fetcher as unknown, 'fetchWithRetry').mockResolvedValue(mockResponse);
            await expect(fetcher.fetchHistoricalPrice('01-01-2023')).rejects.toThrow('Invalid CoinGecko historical response');
        });

        it('fetchHistoricalPrice should throw if required fields missing (manual fail)', async () => {
            const mockResponse = {
                id: 'bitcoin',
                symbol: 'btc',
                name: 'Bitcoin',
                market_data: {
                    current_price: {} // missing usd
                }
            };
            vi.spyOn(fetcher as unknown, 'fetchWithRetry').mockResolvedValue(mockResponse);
            await expect(fetcher.fetchHistoricalPrice('01-01-2023')).rejects.toThrow('missing market_data.current_price.usd');
        });

        it('fetchHistoricalPrice should throw on API error', async () => {
            const apiError = new APIError('Not found', 404);
            vi.spyOn(fetcher as unknown, 'fetchWithRetry').mockRejectedValue(apiError);
            await expect(fetcher.fetchHistoricalPrice('01-01-2023')).rejects.toThrow('CoinGecko API error');
        });

        it('fetchHistoricalPrice should propagate unknown errors', async () => {
            vi.spyOn(fetcher as unknown, 'fetchWithRetry').mockRejectedValue(new Error('Network error'));
            await expect(fetcher.fetchHistoricalPrice('01-01-2023')).rejects.toThrow('Network error');
        });

        // --- Utils ---
        it('formatDateForApi should format date correctly', () => {
            const date = new Date('2023-01-05T00:00:00Z');
            expect(fetcher.formatDateForApi(date)).toBe('05-01-2023');
        });

        // --- Health Check ---
        it('healthCheck should return healthy status', async () => {
            const mockPriceData = {
                priceUsd: 50000,
                marketCapUsd: 1000000,
                volume24hUsd: 500000,
                timestamp: new Date(),
                source: 'coingecko',
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin'
            };
            vi.spyOn(fetcher, 'fetchCurrentPrice').mockResolvedValue(mockPriceData);

            const result = await fetcher.healthCheck();
            expect(result.status).toBe('healthy');
            expect(result.details).toContain('Current BTC price');
        });

        it('healthCheck should return unhealthy for unrealistic price', async () => {
            const mockPriceData = {
                priceUsd: 10,
                marketCapUsd: 1000,
                volume24hUsd: 500,
                timestamp: new Date(),
                source: 'coingecko',
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin'
            };
            vi.spyOn(fetcher, 'fetchCurrentPrice').mockResolvedValue(mockPriceData);

            const result = await fetcher.healthCheck();
            expect(result.status).toBe('unhealthy');
            expect(result.details).toContain('unrealistic');
        });
    });

    describe('TokenPriceWriter', () => {
        let writer: TokenPriceWriter;

        beforeEach(() => {
            writer = new TokenPriceWriter();
        });

        it('insertSnapshot should execute correct query', async () => {
            const data = {
                priceUsd: 50000,
                marketCapUsd: 1000000,
                volume24hUsd: 500000,
                timestamp: new Date('2023-01-01T00:00:00Z'),
                source: 'coingecko',
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin'
            };

            (mockPool.query as unknown).mockResolvedValue({ rows: [{ id: 1, snapshot_date: '2023-01-01' }] });

            await writer.insertSnapshot(data);

            expect(mockPool.query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO token_price_snapshots'),
                expect.arrayContaining([50000, 'BTC', 'bitcoin'])
            );
        });

        it('insertSnapshot should handle database error', async () => {
            const data = {
                priceUsd: 50000,
                marketCapUsd: 1000000,
                volume24hUsd: 500000,
                timestamp: new Date('2023-01-01T00:00:00Z'),
                source: 'coingecko',
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin'
            };

            (mockPool.query as unknown).mockRejectedValue(new Error('DB Error'));

            await expect(writer.insertSnapshot(data)).rejects.toThrow('DB Error');
        });

        it('insertBatch should handle empty array', async () => {
            const result = await writer.insertBatch([]);
            expect(result).toBe(0);
            expect(mockPool.query).not.toHaveBeenCalled();
        });

        it('insertBatch should execute batch insert query', async () => {
            const data = [{
                priceUsd: 50000,
                marketCapUsd: 1000000,
                volume24hUsd: 500000,
                timestamp: new Date('2023-01-01T00:00:00Z'),
                source: 'coingecko',
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin'
            }];

            (mockPool.query as unknown).mockResolvedValue({ rowCount: 1 });

            const count = await writer.insertBatch(data);
            expect(count).toBe(1);
            expect(mockPool.query).toHaveBeenCalledTimes(1);
        });

        it('insertBatch should handle database error', async () => {
            const data = [{
                priceUsd: 50000,
                marketCapUsd: 1000000,
                volume24hUsd: 500000,
                timestamp: new Date('2023-01-01T00:00:00Z'),
                source: 'coingecko',
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin'
            }];

            (mockPool.query as unknown).mockRejectedValue(new Error('DB Error'));

            await expect(writer.insertBatch(data)).rejects.toThrow('DB Error');
        });

        it('getLatestSnapshot should return null if no rows', async () => {
            (mockPool.query as unknown).mockResolvedValue({ rows: [] });
            const result = await writer.getLatestSnapshot();
            expect(result).toBeNull();
        });

        it('getLatestSnapshot should return data if rows exist', async () => {
            const mockRow = {
                snapshot_date: new Date('2023-01-01'),
                price_usd: '50000',
                token_symbol: 'BTC'
            };
            (mockPool.query as unknown).mockResolvedValue({ rows: [mockRow] });

            const result = await writer.getLatestSnapshot();
            expect(result).not.toBeNull();
            expect(result?.price).toBe(50000);
        });

        it('getLatestSnapshot should throw on database error', async () => {
            (mockPool.query as unknown).mockRejectedValue(new Error('DB Error'));
            await expect(writer.getLatestSnapshot()).rejects.toThrow('DB Error');
        });

        it('getSnapshotCount should return count', async () => {
            (mockPool.query as unknown).mockResolvedValue({ rows: [{ count: '10' }] });
            const count = await writer.getSnapshotCount();
            expect(count).toBe(10);
        });

        it('getSnapshotCount should return 0 on error', async () => {
            (mockPool.query as unknown).mockRejectedValue(new Error('DB Error'));
            const count = await writer.getSnapshotCount();
            expect(count).toBe(0);
        });

        it('insertBatch should use rows.length fallback when rowCount is null', async () => {
            const data = [{
                priceUsd: 50000,
                marketCapUsd: 1000000,
                volume24hUsd: 500000,
                timestamp: new Date('2023-01-01T00:00:00Z'),
                source: 'coingecko',
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin'
            }];

            (mockPool.query as unknown).mockResolvedValue({ rowCount: null, rows: [{ id: 1 }, { id: 2 }] });

            const count = await writer.insertBatch(data);
            expect(count).toBe(2);
        });

        it('insertBatch should return 0 when both rowCount and rows are undefined', async () => {
            const data = [{
                priceUsd: 50000,
                marketCapUsd: 1000000,
                volume24hUsd: 500000,
                timestamp: new Date('2023-01-01T00:00:00Z'),
                source: 'coingecko',
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin'
            }];

            (mockPool.query as unknown).mockResolvedValue({});

            const count = await writer.insertBatch(data);
            expect(count).toBe(0);
        });

        it('getLatestSnapshot should handle snapshot_date as string', async () => {
            const mockRow = {
                snapshot_date: '2023-01-01',
                price_usd: '50000',
                token_symbol: 'BTC'
            };
            (mockPool.query as unknown).mockResolvedValue({ rows: [mockRow] });

            const result = await writer.getLatestSnapshot();
            expect(result).not.toBeNull();
            expect(result?.date).toBe('2023-01-01');
            expect(result?.price).toBe(50000);
        });

        it('getSnapshotCount should return 0 when count is undefined', async () => {
            (mockPool.query as unknown).mockResolvedValue({ rows: [{}] });
            const count = await writer.getSnapshotCount();
            expect(count).toBe(0);
        });

        it('getExistingDatesInRange should return dates', async () => {
            (mockPool.query as unknown).mockResolvedValue({ rows: [{ snapshot_date: '2023-01-01' }] });
            const dates = await writer.getExistingDatesInRange(new Date(), new Date());
            expect(dates).toEqual(['2023-01-01']);
        });

        it('getExistingDatesInRange should return empty array on error', async () => {
            (mockPool.query as unknown).mockRejectedValue(new Error('DB Error'));
            const dates = await writer.getExistingDatesInRange(new Date(), new Date());
            expect(dates).toEqual([]);
        });

    });

    describe('Pipeline Integration', () => {
        it('process should run successfully', async () => {
            const job: ETLJob = {
                jobId: 'test-job',
                trigger: 'manual',
                sources: ['token-price'],
                createdAt: new Date(),
                status: 'pending'
            };

            const mockPriceData = {
                priceUsd: 50000,
                marketCapUsd: 1000000,
                volume24hUsd: 500000,
                timestamp: new Date(),
                source: 'coingecko',
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin'
            };

            vi.spyOn(CoinGeckoFetcher.prototype, 'fetchCurrentPrice').mockResolvedValue(mockPriceData);
            vi.spyOn(TokenPriceWriter.prototype, 'insertSnapshot').mockResolvedValue();

            const result = await pipeline.process(job);

            expect(result.success).toBe(true);
            expect(result.recordsInserted).toBe(1);
        });

        it('process should trigger DMA post-step on success', async () => {
            const job: ETLJob = {
                jobId: 'test-dma-post',
                trigger: 'manual',
                sources: ['token-price'],
                createdAt: new Date(),
                status: 'pending'
            };

            const mockPriceData = {
                priceUsd: 50000,
                marketCapUsd: 1000000,
                volume24hUsd: 500000,
                timestamp: new Date(),
                source: 'coingecko',
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin'
            };

            vi.spyOn(CoinGeckoFetcher.prototype, 'fetchCurrentPrice').mockResolvedValue(mockPriceData);
            vi.spyOn(TokenPriceWriter.prototype, 'insertSnapshot').mockResolvedValue();
            const dmaSpy = vi.spyOn(TokenPriceDmaService.prototype, 'updateDmaForToken')
                .mockResolvedValue({ recordsInserted: 5 });

            const result = await pipeline.process(job);

            expect(result.success).toBe(true);
            expect(dmaSpy).toHaveBeenCalledWith('BTC', 'bitcoin', 'test-dma-post');
        });

        it('process should handle DMA post-step failure gracefully', async () => {
            const job: ETLJob = {
                jobId: 'test-dma-fail',
                trigger: 'manual',
                sources: ['token-price'],
                createdAt: new Date(),
                status: 'pending'
            };

            const mockPriceData = {
                priceUsd: 50000,
                marketCapUsd: 1000000,
                volume24hUsd: 500000,
                timestamp: new Date(),
                source: 'coingecko',
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin'
            };

            vi.spyOn(CoinGeckoFetcher.prototype, 'fetchCurrentPrice').mockResolvedValue(mockPriceData);
            vi.spyOn(TokenPriceWriter.prototype, 'insertSnapshot').mockResolvedValue();
            vi.spyOn(TokenPriceDmaService.prototype, 'updateDmaForToken')
                .mockRejectedValue(new Error('DMA compute failed'));

            const result = await pipeline.process(job);

            // DMA failure is non-fatal — process still succeeds
            expect(result.success).toBe(true);
        });

        it('process should handle validation errors', async () => {
            const job = {
                jobId: 'test-job',
                // invalid (but mock needs to throw)
            } as unknown;

            (validateETLJob as unknown).mockImplementationOnce(() => {
                throw new Error('Validation failed');
            });

            const result = await pipeline.process(job);
            expect(result.success).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('process should handle execution errors', async () => {
            const job: ETLJob = {
                jobId: 'test-job',
                trigger: 'manual',
                sources: ['token-price'],
                createdAt: new Date(),
                status: 'pending'
            };

            vi.spyOn(CoinGeckoFetcher.prototype, 'fetchCurrentPrice').mockRejectedValue(new Error('Fetch failed'));

            const result = await pipeline.process(job);
            expect(result.success).toBe(false);
            expect(result.errors[0]).toContain('Fetch failed');
        });
    });

    describe('Process Edge Cases', () => {
        it('process should handle non-Error exceptions', async () => {
            const job: ETLJob = {
                jobId: 'test-job-error',
                trigger: 'manual',
                sources: ['token-price'],
                createdAt: new Date(),
                status: 'pending'
            };
            // Mock validateETLJob to throw a string
            (validateETLJob as unknown).mockImplementationOnce(() => {
                const nonError: unknown = 'String Error';
                throw nonError;
            });

            const result = await pipeline.process(job);

            expect(result.success).toBe(false);
            expect(result.errors).toContain('Unknown error');
        });
    });


    describe('Backfill History', () => {
        it('backfillHistory should detect gaps and fill them', async () => {
            const existingDates = ['2023-01-01', '2023-01-03'];
            vi.spyOn(TokenPriceWriter.prototype, 'getExistingDatesInRange').mockResolvedValue(existingDates);

            const mockPriceData = {
                priceUsd: 50000,
                marketCapUsd: 1000000,
                volume24hUsd: 500000,
                timestamp: new Date('2023-01-02T00:00:00Z'),
                source: 'coingecko',
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin'
            };

            vi.spyOn(CoinGeckoFetcher.prototype, 'fetchHistoricalPrice').mockResolvedValue(mockPriceData);
            vi.spyOn(TokenPriceWriter.prototype, 'insertBatch').mockResolvedValue(1);
            vi.spyOn(CoinGeckoFetcher.prototype, 'formatDateForApi').mockReturnValue('02-01-2023');

            const result = await pipeline.backfillHistory(3);

            expect(result.fetched).toBeGreaterThanOrEqual(0);
        });

        it('backfillHistory should handle empty missing dates', async () => {
            vi.spyOn(TokenPriceWriter.prototype, 'getExistingDatesInRange').mockResolvedValue([]);
            vi.spyOn(CoinGeckoFetcher.prototype, 'fetchHistoricalPrice').mockResolvedValue({} as unknown);
            vi.spyOn(TokenPriceWriter.prototype, 'insertBatch').mockResolvedValue(0);
            await pipeline.backfillHistory(1);
        });
    });

    describe('Other Pipeline Methods', () => {
        it('processCurrentPrice should fetch and store data', async () => {
            const mockPriceData = {
                priceUsd: 50000,
                marketCapUsd: 1000000,
                volume24hUsd: 500000,
                timestamp: new Date(),
                source: 'coingecko',
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin'
            };

            vi.spyOn(CoinGeckoFetcher.prototype, 'fetchCurrentPrice').mockResolvedValue(mockPriceData);
            vi.spyOn(TokenPriceWriter.prototype, 'insertSnapshot').mockResolvedValue();

            await pipeline.processCurrentPrice();

            expect(CoinGeckoFetcher.prototype.fetchCurrentPrice).toHaveBeenCalled();
            expect(TokenPriceWriter.prototype.insertSnapshot).toHaveBeenCalledWith(mockPriceData);
        });

        it('processCurrentPrice should propagate error', async () => {
            vi.spyOn(CoinGeckoFetcher.prototype, 'fetchCurrentPrice').mockRejectedValue(new Error('Fail'));
            await expect(pipeline.processCurrentPrice()).rejects.toThrow('Fail');
        });

        it('healthCheck should return healthy status', async () => {
            vi.spyOn(CoinGeckoFetcher.prototype, 'healthCheck').mockResolvedValue({ status: 'healthy' });
            vi.spyOn(TokenPriceWriter.prototype, 'getLatestSnapshot').mockResolvedValue({
                date: new Date().toISOString().split('T')[0],
                price: 50000,
                tokenSymbol: 'BTC'
            });
            vi.spyOn(TokenPriceWriter.prototype, 'getSnapshotCount').mockResolvedValue(100);

            const result = await pipeline.healthCheck();
            expect(result.status).toBe('healthy');
        });

        it('healthCheck should return unhealthy if underlying component is unhealthy', async () => {
            vi.spyOn(CoinGeckoFetcher.prototype, 'healthCheck').mockResolvedValue({ status: 'unhealthy' });
            vi.spyOn(TokenPriceWriter.prototype, 'getLatestSnapshot').mockResolvedValue(null);
            vi.spyOn(TokenPriceWriter.prototype, 'getSnapshotCount').mockResolvedValue(0);

            const result = await pipeline.healthCheck();
            expect(result.status).toBe('unhealthy');
        });

        it('healthCheck should return unhealthy when no snapshot data exists', async () => {
            vi.spyOn(CoinGeckoFetcher.prototype, 'healthCheck').mockResolvedValue({ status: 'healthy' });
            vi.spyOn(TokenPriceWriter.prototype, 'getLatestSnapshot').mockResolvedValue(null);
            vi.spyOn(TokenPriceWriter.prototype, 'getSnapshotCount').mockResolvedValue(0);

            const result = await pipeline.healthCheck();
            expect(result.status).toBe('unhealthy');
            const details = JSON.parse(result.details as string);
            expect(details.dataFreshness).toBe('unknown');
        });

        it('healthCheck should include DMA info when available', async () => {
            vi.spyOn(CoinGeckoFetcher.prototype, 'healthCheck').mockResolvedValue({ status: 'healthy' });
            vi.spyOn(TokenPriceWriter.prototype, 'getLatestSnapshot').mockResolvedValue({
                date: new Date().toISOString().split('T')[0],
                price: 50000,
                tokenSymbol: 'BTC'
            });
            vi.spyOn(TokenPriceWriter.prototype, 'getSnapshotCount').mockResolvedValue(100);
            vi.spyOn(TokenPriceDmaService.prototype, 'getLatestDmaSnapshot').mockResolvedValue({
                date: new Date().toISOString().split('T')[0],
                price: 50000,
                dma200: 48000,
                isAboveDma: true
            });

            const result = await pipeline.healthCheck();
            expect(result.status).toBe('healthy');
            const details = JSON.parse(result.details as string);
            expect(details.dma).toEqual({
                latestDate: expect.any(String),
                dma200: 48000,
                isAboveDma: true
            });
        });

        it('healthCheck should still work when DMA service throws', async () => {
            vi.spyOn(CoinGeckoFetcher.prototype, 'healthCheck').mockResolvedValue({ status: 'healthy' });
            vi.spyOn(TokenPriceWriter.prototype, 'getLatestSnapshot').mockResolvedValue({
                date: new Date().toISOString().split('T')[0],
                price: 50000,
                tokenSymbol: 'BTC'
            });
            vi.spyOn(TokenPriceWriter.prototype, 'getSnapshotCount').mockResolvedValue(100);
            vi.spyOn(TokenPriceDmaService.prototype, 'getLatestDmaSnapshot').mockRejectedValue(new Error('DMA query failed'));

            const result = await pipeline.healthCheck();
            expect(result.status).toBe('healthy');
            const details = JSON.parse(result.details as string);
            expect(details.dma).toBeNull();
        });

        it('healthCheck should return unhealthy when API is unhealthy even with fresh data', async () => {
            vi.spyOn(CoinGeckoFetcher.prototype, 'healthCheck').mockResolvedValue({ status: 'unhealthy' });
            vi.spyOn(TokenPriceWriter.prototype, 'getLatestSnapshot').mockResolvedValue({
                date: new Date().toISOString().split('T')[0],
                price: 50000,
                tokenSymbol: 'BTC'
            });
            vi.spyOn(TokenPriceWriter.prototype, 'getSnapshotCount').mockResolvedValue(100);

            const result = await pipeline.healthCheck();
            expect(result.status).toBe('unhealthy');
        });

        it('healthCheck should return unhealthy when data is stale even with healthy API', async () => {
            const staleDate = new Date();
            staleDate.setUTCDate(staleDate.getUTCDate() - 5);

            vi.spyOn(CoinGeckoFetcher.prototype, 'healthCheck').mockResolvedValue({ status: 'healthy' });
            vi.spyOn(TokenPriceWriter.prototype, 'getLatestSnapshot').mockResolvedValue({
                date: staleDate.toISOString().split('T')[0],
                price: 50000,
                tokenSymbol: 'BTC'
            });
            vi.spyOn(TokenPriceWriter.prototype, 'getSnapshotCount').mockResolvedValue(100);

            const result = await pipeline.healthCheck();
            expect(result.status).toBe('unhealthy');
        });

        it('getStats should return stats object', () => {
            const stats = pipeline.getStats();
            expect(stats).toHaveProperty('totalProcessed');
            expect(stats).toHaveProperty('totalErrors');
        });

        it('getStats should show success rate after successful processing', async () => {
            const job: ETLJob = {
                jobId: 'stats-test-job',
                trigger: 'manual',
                sources: ['token-price'],
                createdAt: new Date(),
                status: 'pending'
            };

            const mockPriceData = {
                priceUsd: 50000,
                marketCapUsd: 1000000,
                volume24hUsd: 500000,
                timestamp: new Date(),
                source: 'coingecko',
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin'
            };

            vi.spyOn(CoinGeckoFetcher.prototype, 'fetchCurrentPrice').mockResolvedValue(mockPriceData);
            vi.spyOn(TokenPriceWriter.prototype, 'insertSnapshot').mockResolvedValue();

            await pipeline.process(job);

            const stats = pipeline.getStats();
            expect(stats.totalProcessed).toBe(1);
            expect(stats.lastProcessedAt).not.toBeNull();
        });

        it('getSourceType should return correct source', () => {
            expect(pipeline.getSourceType()).toBe('token-price');
        });
    });
});
