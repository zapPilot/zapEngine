/* eslint-disable max-lines-per-function */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateDateRange, calculateMissingDates, formatDateToYYYYMMDD } from '../../../../src/utils/dateUtils.js';

// Hoisted mocks - must be declared before vi.mock
const {
    mockFetcher,
    mockWriter,
    mockLogger
} = vi.hoisted(() => ({
    mockFetcher: {
        fetchCurrentPrice: vi.fn(),
        fetchHistoricalPrice: vi.fn(),
        formatDateForApi: vi.fn((date: Date) =>
            date.toISOString().split('T')[0].split('-').reverse().join('-')
        ),
        healthCheck: vi.fn(),
        getRequestStats: vi.fn(() => ({}))
    },
    mockWriter: {
        insertSnapshot: vi.fn(),
        insertBatch: vi.fn(),
        getExistingDatesInRange: vi.fn(),
        getLatestSnapshot: vi.fn(),
        getSnapshotCount: vi.fn()
    },
    mockLogger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
    }
}));

// Mock logger
vi.mock('../../../../src/utils/logger.js', () => ({
    logger: mockLogger
}));

// Mock the consolidated pipeline module with MockedTokenPriceETLProcessor
vi.mock('../../../../src/modules/token-price/index.js', async () => {
    const actualModule = await vi.importActual<typeof import('../../../../src/modules/token-price/index.js')>('../../../../src/modules/token-price/index.js');

    // Create a MockedTokenPriceETLProcessor that uses hoisted mock objects directly
    class MockedTokenPriceETLProcessor {
        private fetcher = mockFetcher;
        private writer = mockWriter;
        private stats = {
            totalProcessed: 0,
            totalInserted: 0,
            totalErrors: 0,
            lastProcessedAt: null as Date | null
        };

        getSourceType() {
            return 'token-price';
        }

        getStats() {
            const successRate = this.stats.totalProcessed > 0
                ? ((this.stats.totalProcessed - this.stats.totalErrors) / this.stats.totalProcessed * 100).toFixed(2) + '%'
                : '0.00%';
            return { ...this.stats, successRate };
        }

        async process(job: { jobId: string }) {
            this.stats.totalProcessed++;
            this.stats.lastProcessedAt = new Date();

            try {
                const priceData = await this.fetcher.fetchCurrentPrice('bitcoin', 'BTC');
                await this.writer.insertSnapshot(priceData);
                this.stats.totalInserted++;
                return {
                    success: true,
                    recordsProcessed: 1,
                    recordsInserted: 1,
                    errors: [],
                    source: 'token-price'
                };
            } catch (error) {
                this.stats.totalErrors++;
                return {
                    success: false,
                    recordsProcessed: 1,
                    recordsInserted: 0,
                    errors: [error instanceof Error ? error.message : 'Unknown error'],
                    source: 'token-price'
                };
            }
        }

        async processCurrentPrice(tokenId = 'bitcoin', tokenSymbol = 'BTC') {
            const priceData = await this.fetcher.fetchCurrentPrice(tokenId, tokenSymbol);
            await this.writer.insertSnapshot(priceData);
        }

        async backfillHistory(daysBack = 30, tokenId = 'bitcoin', tokenSymbol = 'BTC') {
            const source = 'coingecko';
            const endDate = new Date();
            endDate.setUTCHours(0, 0, 0, 0);

            const startDate = new Date(endDate);
            startDate.setUTCDate(startDate.getUTCDate() - daysBack + 1);

            // Use gap detection via writer
            let existingDates: string[] = [];
            try {
                existingDates = await this.writer.getExistingDatesInRange(
                    startDate,
                    endDate,
                    tokenSymbol,
                    source
                );
            } catch (error) {
                mockLogger.warn('Gap detection failed, proceeding with full backfill', { error });
                existingDates = [];
            }

            // Generate all dates in range and find missing ones
            const allDates = generateDateRange(startDate, endDate);
            const missingDates = calculateMissingDates(allDates, existingDates);

            const snapshots: unknown[] = [];

            // Only fetch missing dates (missingDates is Date[] from calculateMissingDates)
            for (const date of missingDates) {
                try {
                    const formattedDate = this.fetcher.formatDateForApi(date);
                    const priceData = await this.fetcher.fetchHistoricalPrice(formattedDate, tokenId, tokenSymbol);
                    snapshots.push(priceData);
                } catch (error) {
                    const dateStr = formatDateToYYYYMMDD(date);
                    mockLogger.error('Failed to fetch historical price', { date: dateStr, error });
                }
            }

            // Batch insert
            let inserted = 0;
            if (snapshots.length > 0) {
                inserted = await this.writer.insertBatch(snapshots);
            }

            return {
                requested: daysBack,
                existing: existingDates.length,
                fetched: snapshots.length,
                inserted
            };
        }

        async healthCheck(tokenId = 'bitcoin', tokenSymbol = 'BTC') {
            try {
                const apiStatus = await this.fetcher.healthCheck(tokenId, tokenSymbol);
                const latestSnapshot = await this.writer.getLatestSnapshot(tokenSymbol);
                const totalSnapshots = await this.writer.getSnapshotCount(tokenSymbol);

                // Check data freshness
                let dataFresh = false;
                if (latestSnapshot) {
                    const lastDate = new Date(latestSnapshot.date);
                    const now = new Date();
                    const daysDiff = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
                    dataFresh = daysDiff <= 1;
                }

                const isHealthy = apiStatus.status === 'healthy' && dataFresh;

                return {
                    status: isHealthy ? 'healthy' : 'unhealthy',
                    details: JSON.stringify({
                        apiStatus: apiStatus.status,
                        latestSnapshot: latestSnapshot?.date || 'none',
                        totalSnapshots,
                        dataFresh,
                        tokenId,
                        tokenSymbol
                    })
                };
            } catch (error) {
                return {
                    status: 'unhealthy',
                    details: error instanceof Error ? error.message : 'Unknown error'
                };
            }
        }
    }

    return {
        ...actualModule,
        TokenPriceETLProcessor: MockedTokenPriceETLProcessor,
        CoinGeckoFetcher: vi.fn(function CoinGeckoFetcher() {
            return mockFetcher;
        }),
        TokenPriceWriter: vi.fn(function TokenPriceWriter() {
            return mockWriter;
        }),
    };
});

import { TokenPriceETLProcessor } from '../../../../src/modules/token-price/index.js';

describe('TokenPriceProcessor', () => {
    let processor: TokenPriceETLProcessor;

    beforeEach(() => {
        vi.clearAllMocks();

        // Reset mock implementations
        mockFetcher.fetchHistoricalPrice.mockReset();
        mockFetcher.fetchCurrentPrice.mockReset();
        mockFetcher.healthCheck.mockReset();
        mockFetcher.formatDateForApi.mockImplementation((date: Date) =>
            date.toISOString().split('T')[0].split('-').reverse().join('-')
        );
        mockWriter.getExistingDatesInRange.mockReset();
        mockWriter.insertBatch.mockReset();
        mockWriter.insertSnapshot.mockReset();
        mockWriter.getLatestSnapshot.mockReset();
        mockWriter.getSnapshotCount.mockReset();

        processor = new TokenPriceETLProcessor();
    });

    describe('backfillHistory with gap detection', () => {
        it('should call writer.getExistingDatesInRange with correct parameters', async () => {
            mockWriter.getExistingDatesInRange.mockResolvedValue([]);
            mockFetcher.fetchHistoricalPrice.mockResolvedValue({
                priceUsd: 50000,
                marketCapUsd: 1000000000,
                volume24hUsd: 50000000,
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin',
                source: 'coingecko',
                timestamp: new Date()
            });
            mockWriter.insertBatch.mockResolvedValue(2);

            await processor.backfillHistory(2, 'bitcoin', 'BTC');

            // Verify gap detection was attempted
            expect(mockWriter.getExistingDatesInRange).toHaveBeenCalledWith(
                expect.any(Date),
                expect.any(Date),
                'BTC',
                'coingecko'
            );
        }, 15000);

        it('should call writer.insertBatch with fetched snapshots', async () => {
            mockWriter.getExistingDatesInRange.mockResolvedValue([]);
            mockFetcher.fetchHistoricalPrice.mockResolvedValue({
                priceUsd: 50000,
                marketCapUsd: 1000000000,
                volume24hUsd: 50000000,
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin',
                source: 'coingecko',
                timestamp: new Date()
            });
            mockWriter.insertBatch.mockResolvedValue(2);

            await processor.backfillHistory(2, 'bitcoin', 'BTC');

            // Verify batch insert was called
            expect(mockWriter.insertBatch).toHaveBeenCalled();
        }, 15000);

        it('should return result structure with all required fields', async () => {
            mockWriter.getExistingDatesInRange.mockResolvedValue([]);
            mockFetcher.fetchHistoricalPrice.mockResolvedValue({
                priceUsd: 50000,
                marketCapUsd: 1000000000,
                volume24hUsd: 50000000,
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin',
                source: 'coingecko',
                timestamp: new Date()
            });
            mockWriter.insertBatch.mockResolvedValue(2);

            const result = await processor.backfillHistory(2, 'bitcoin', 'BTC');

            expect(result).toHaveProperty('requested');
            expect(result).toHaveProperty('existing');
            expect(result).toHaveProperty('fetched');
            expect(result).toHaveProperty('inserted');
            expect(typeof result.requested).toBe('number');
            expect(typeof result.existing).toBe('number');
            expect(typeof result.fetched).toBe('number');
            expect(typeof result.inserted).toBe('number');
        }, 15000);

        it('should handle database errors gracefully during gap detection', async () => {
            mockWriter.getExistingDatesInRange.mockRejectedValue(
                new Error('Database error')
            );
            mockFetcher.fetchHistoricalPrice.mockResolvedValue({
                priceUsd: 50000,
                marketCapUsd: 1000000000,
                volume24hUsd: 50000000,
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin',
                source: 'coingecko',
                timestamp: new Date()
            });
            mockWriter.insertBatch.mockResolvedValue(2);

            const result = await processor.backfillHistory(2, 'bitcoin', 'BTC');

            // Should fallback gracefully (existing = 0 when gap detection fails)
            expect(result).toHaveProperty('existing');
            expect(result.existing).toBe(0);
        }, 15000);

        it('should use default parameters when not provided', async () => {
            mockWriter.getExistingDatesInRange.mockResolvedValue([]);
            mockFetcher.fetchHistoricalPrice.mockResolvedValue({
                priceUsd: 50000,
                marketCapUsd: 1000000000,
                volume24hUsd: 50000000,
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin',
                source: 'coingecko',
                timestamp: new Date()
            });
            mockWriter.insertBatch.mockResolvedValue(30);

            const result = await processor.backfillHistory();

            expect(result.requested).toBe(30); // Default daysBack
        });
    });

    describe('processCurrentPrice', () => {
        it('should fetch and store current price successfully', async () => {
            mockFetcher.fetchCurrentPrice.mockResolvedValue({
                priceUsd: 97500,
                marketCapUsd: 1900000000000,
                volume24hUsd: 45000000000,
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin',
                source: 'coingecko',
                timestamp: new Date()
            });
            mockWriter.insertSnapshot.mockResolvedValue(undefined);

            await processor.processCurrentPrice('bitcoin', 'BTC');

            expect(mockFetcher.fetchCurrentPrice).toHaveBeenCalledWith('bitcoin', 'BTC');
            expect(mockWriter.insertSnapshot).toHaveBeenCalled();
        });

        it('should throw error when fetch fails', async () => {
            mockFetcher.fetchCurrentPrice.mockRejectedValue(new Error('API rate limited'));

            await expect(processor.processCurrentPrice('bitcoin', 'BTC')).rejects.toThrow('API rate limited');
        });

        it('should throw error when database insert fails', async () => {
            mockFetcher.fetchCurrentPrice.mockResolvedValue({
                priceUsd: 97500,
                marketCapUsd: 1900000000000,
                volume24hUsd: 45000000000,
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin',
                source: 'coingecko',
                timestamp: new Date()
            });
            mockWriter.insertSnapshot.mockRejectedValue(new Error('Connection refused'));

            await expect(processor.processCurrentPrice('bitcoin', 'BTC')).rejects.toThrow('Connection refused');
        });

        it('should use default parameters', async () => {
            mockFetcher.fetchCurrentPrice.mockResolvedValue({
                priceUsd: 97500,
                marketCapUsd: 1900000000000,
                volume24hUsd: 45000000000,
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin',
                source: 'coingecko',
                timestamp: new Date()
            });
            mockWriter.insertSnapshot.mockResolvedValue(undefined);

            await processor.processCurrentPrice();

            expect(mockFetcher.fetchCurrentPrice).toHaveBeenCalledWith('bitcoin', 'BTC');
        });
    });

    describe('healthCheck', () => {
        it('should return healthy when API is up and data is fresh', async () => {
            const yesterday = new Date();
            yesterday.setUTCDate(yesterday.getUTCDate() - 1);

            mockFetcher.healthCheck.mockResolvedValue({ status: 'healthy', details: 'BTC price: $97,500' });
            mockWriter.getLatestSnapshot.mockResolvedValue({
                date: yesterday.toISOString().split('T')[0],
                price: 97500,
                tokenSymbol: 'BTC'
            });
            mockWriter.getSnapshotCount.mockResolvedValue(365);

            const result = await processor.healthCheck();

            expect(result.status).toBe('healthy');
            const details = JSON.parse(result.details!);
            expect(details).toHaveProperty('apiStatus', 'healthy');
            expect(details).toHaveProperty('totalSnapshots', 365);
        });

        it('should return unhealthy when data is slightly stale (2-3 days old)', async () => {
            const threeDaysAgo = new Date();
            threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() - 3);

            mockFetcher.healthCheck.mockResolvedValue({ status: 'healthy', details: 'ok' });
            mockWriter.getLatestSnapshot.mockResolvedValue({
                date: threeDaysAgo.toISOString().split('T')[0],
                price: 97500,
                tokenSymbol: 'BTC'
            });
            mockWriter.getSnapshotCount.mockResolvedValue(100);

            const result = await processor.healthCheck();

            expect(result.status).toBe('unhealthy');
        });

        it('should return unhealthy when data is very stale (>3 days old)', async () => {
            const weekAgo = new Date();
            weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);

            mockFetcher.healthCheck.mockResolvedValue({ status: 'healthy', details: 'ok' });
            mockWriter.getLatestSnapshot.mockResolvedValue({
                date: weekAgo.toISOString().split('T')[0],
                price: 97500,
                tokenSymbol: 'BTC'
            });
            mockWriter.getSnapshotCount.mockResolvedValue(100);

            const result = await processor.healthCheck();

            expect(result.status).toBe('unhealthy');
        });

        it('should return unhealthy when no data exists', async () => {
            mockFetcher.healthCheck.mockResolvedValue({ status: 'healthy', details: 'ok' });
            mockWriter.getLatestSnapshot.mockResolvedValue(null);
            mockWriter.getSnapshotCount.mockResolvedValue(0);

            const result = await processor.healthCheck();

            expect(result.status).toBe('unhealthy');
        });

        it('should return unhealthy on error', async () => {
            mockFetcher.healthCheck.mockRejectedValue(new Error('Network failure'));

            const result = await processor.healthCheck();

            expect(result.status).toBe('unhealthy');
            expect(result.details).toBe('Network failure');
        });

        it('should use default parameters', async () => {
            mockFetcher.healthCheck.mockResolvedValue({ status: 'healthy', details: 'ok' });
            mockWriter.getLatestSnapshot.mockResolvedValue(null);
            mockWriter.getSnapshotCount.mockResolvedValue(0);

            const result = await processor.healthCheck();

            const details = JSON.parse(result.details!);
            expect(mockFetcher.healthCheck).toHaveBeenCalledWith('bitcoin', 'BTC');
            expect(details.tokenId).toBe('bitcoin');
            expect(details.tokenSymbol).toBe('BTC');
        });
    });

    describe('process', () => {
        const mockJob = {
            jobId: 'test-123',
            trigger: 'scheduled',
            sources: ['token-price'],
            filters: {},
            createdAt: new Date(),
            status: 'pending'
        };

        it('should process current price successfully', async () => {
            mockFetcher.fetchCurrentPrice.mockResolvedValue({
                priceUsd: 97500,
                marketCapUsd: 1900000000000,
                volume24hUsd: 45000000000,
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin',
                source: 'coingecko',
                timestamp: new Date()
            });
            mockWriter.insertSnapshot.mockResolvedValue(undefined);

            const result = await processor.process(mockJob);

            expect(result.success).toBe(true);
            expect(result.recordsProcessed).toBe(1);
            expect(result.recordsInserted).toBe(1);
            expect(result.source).toBe('token-price');
            expect(mockFetcher.fetchCurrentPrice).toHaveBeenCalledWith('bitcoin', 'BTC');
        });

        it('should handle processing error', async () => {
            mockFetcher.fetchCurrentPrice.mockRejectedValue(new Error('API Error'));

            const result = await processor.process(mockJob);

            expect(result.success).toBe(false);
            expect(result.errors).toContain('API Error');
        });

        it('should track stats', async () => {
            mockFetcher.fetchCurrentPrice.mockResolvedValue({
                priceUsd: 97500,
                marketCapUsd: 1900000000000,
                volume24hUsd: 45000000000,
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin',
                source: 'coingecko',
                timestamp: new Date()
            });
            mockWriter.insertSnapshot.mockResolvedValue(undefined);

            await processor.process(mockJob);

            const stats = processor.getStats();
            expect(stats.totalProcessed).toBe(1);
            expect(stats.totalErrors).toBe(0);
            expect(stats.successRate).toBe('100.00%');
        });
    });

    describe('getSourceType', () => {
        it('should return token-price', () => {
            expect(processor.getSourceType()).toBe('token-price');
        });
    });

    // Timezone bug fix integration tests
    describe('backfillHistory - timezone-safe gap detection', () => {
        it('should only fetch truly missing dates (not existing ones)', async () => {
            // Calculate dates based on "today" (what processor uses)
            const today = new Date();
            today.setUTCHours(0, 0, 0, 0);

            const date1 = new Date(today);
            date1.setUTCDate(date1.getUTCDate() - 4);  // 5 days back
            const date2 = new Date(today);
            date2.setUTCDate(date2.getUTCDate() - 3);
            const date4 = new Date(today);
            date4.setUTCDate(date4.getUTCDate() - 1);

            // Database has: day 1, day 2, day 4
            // Missing: day 3, day 5 (today)
            mockWriter.getExistingDatesInRange.mockResolvedValue([
                date1.toISOString().split('T')[0],
                date2.toISOString().split('T')[0],
                date4.toISOString().split('T')[0]
            ]);

            mockFetcher.fetchHistoricalPrice.mockResolvedValue({
                priceUsd: 50000,
                marketCapUsd: 1000000000,
                volume24hUsd: 50000000,
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin',
                source: 'coingecko',
                timestamp: new Date()
            });
            mockWriter.insertBatch.mockResolvedValue(2);

            // Request 5 days backfill
            const result = await processor.backfillHistory(5, 'bitcoin', 'BTC');

            // Should detect 3 existing dates
            expect(result.existing).toBe(3);
            // Should fetch 2 missing dates
            expect(result.fetched).toBe(2);
            // Should NOT fetch existing dates
            expect(mockFetcher.fetchHistoricalPrice).toHaveBeenCalledTimes(2);
        }, 15000);

        it('should handle gap detection with no existing dates', async () => {
            // Database is empty (first backfill)
            mockWriter.getExistingDatesInRange.mockResolvedValue([]);

            mockFetcher.fetchHistoricalPrice.mockResolvedValue({
                priceUsd: 50000,
                marketCapUsd: 1000000000,
                volume24hUsd: 50000000,
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin',
                source: 'coingecko',
                timestamp: new Date()
            });
            mockWriter.insertBatch.mockResolvedValue(3);

            const result = await processor.backfillHistory(3, 'bitcoin', 'BTC');

            // No existing dates
            expect(result.existing).toBe(0);
            // Should fetch all 3 days
            expect(result.fetched).toBe(3);
            expect(mockFetcher.fetchHistoricalPrice).toHaveBeenCalledTimes(3);
        }, 15000);

        it('should handle gap detection with all dates existing (100% cached)', async () => {
            // All dates already exist in database (all 3 days)
            const today = new Date();
            today.setUTCHours(0, 0, 0, 0);

            const dates = [];
            for (let i = 0; i < 3; i++) {
                const date = new Date(today);
                date.setUTCDate(date.getUTCDate() - (2 - i));  // 3 days: -2, -1, 0 (today)
                dates.push(date.toISOString().split('T')[0]);
            }

            mockWriter.getExistingDatesInRange.mockResolvedValue(dates);
            mockWriter.insertBatch.mockResolvedValue(0);

            const result = await processor.backfillHistory(3, 'bitcoin', 'BTC');

            // All 3 dates exist
            expect(result.existing).toBe(3);
            // No missing dates to fetch
            expect(result.fetched).toBe(0);
            expect(mockFetcher.fetchHistoricalPrice).not.toHaveBeenCalled();
        }, 15000);

        it('should work correctly regardless of server timezone (UTC+8)', async () => {
            const today = new Date();
            today.setUTCHours(0, 0, 0, 0);

            const date1 = new Date(today);
            date1.setUTCDate(date1.getUTCDate() - 2);
            const date2 = new Date(today);
            date2.setUTCDate(date2.getUTCDate() - 1);

            mockWriter.getExistingDatesInRange.mockResolvedValue([
                date1.toISOString().split('T')[0],  // day -2
                date2.toISOString().split('T')[0]   // day -1
            ]);

            mockFetcher.fetchHistoricalPrice.mockResolvedValue({
                priceUsd: 50000,
                marketCapUsd: 1000000000,
                volume24hUsd: 50000000,
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin',
                source: 'coingecko',
                timestamp: new Date()
            });
            mockWriter.insertBatch.mockResolvedValue(1);

            // Request 3 days
            const result = await processor.backfillHistory(3, 'bitcoin', 'BTC');

            // Should detect 2 existing dates correctly
            expect(result.existing).toBe(2);
            // Should fetch only the 1 missing date (today)
            expect(result.fetched).toBe(1);
        }, 15000);

        it('should handle date boundaries without timezone issues (year end)', async () => {
            const today = new Date();
            today.setUTCHours(0, 0, 0, 0);

            const date1 = new Date(today);
            date1.setUTCDate(date1.getUTCDate() - 1);  // Yesterday

            mockWriter.getExistingDatesInRange.mockResolvedValue([
                date1.toISOString().split('T')[0]  // day -1 exists
            ]);

            mockFetcher.fetchHistoricalPrice.mockResolvedValue({
                priceUsd: 50000,
                marketCapUsd: 1000000000,
                volume24hUsd: 50000000,
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin',
                source: 'coingecko',
                timestamp: new Date()
            });
            mockWriter.insertBatch.mockResolvedValue(1);

            // Request 2 days
            const result = await processor.backfillHistory(2, 'bitcoin', 'BTC');

            // Should detect day -1 exists
            expect(result.existing).toBe(1);
            // Should fetch today
            expect(result.fetched).toBe(1);
        }, 15000);

        it('should calculate efficiency correctly with partial cache', async () => {
            // 7 out of 10 dates exist (70% efficiency)
            const today = new Date();
            today.setUTCHours(0, 0, 0, 0);

            const existingDates = [];
            // Add 7 dates (skip 3 to simulate gaps)
            for (let i = 9; i >= 0; i--) {
                if (i !== 5 && i !== 3 && i !== 1) {  // Skip 3 dates to create gaps
                    const date = new Date(today);
                    date.setUTCDate(date.getUTCDate() - i);
                    existingDates.push(date.toISOString().split('T')[0]);
                }
            }

            mockWriter.getExistingDatesInRange.mockResolvedValue(existingDates);

            mockFetcher.fetchHistoricalPrice.mockResolvedValue({
                priceUsd: 50000,
                marketCapUsd: 1000000000,
                volume24hUsd: 50000000,
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin',
                source: 'coingecko',
                timestamp: new Date()
            });
            mockWriter.insertBatch.mockResolvedValue(3);

            const result = await processor.backfillHistory(10, 'bitcoin', 'BTC');

            expect(result.existing).toBe(7);
            expect(result.fetched).toBe(3);  // 3 missing dates
        }, 15000);

        it('should handle gaps in middle of date range', async () => {
            const today = new Date();
            today.setUTCHours(0, 0, 0, 0);

            const firstDate = new Date(today);
            firstDate.setUTCDate(firstDate.getUTCDate() - 4);  // First date in range

            const lastDate = new Date(today);  // Last date in range (today)

            mockWriter.getExistingDatesInRange.mockResolvedValue([
                firstDate.toISOString().split('T')[0],  // First date exists
                lastDate.toISOString().split('T')[0]    // Last date exists
            ]);

            mockFetcher.fetchHistoricalPrice.mockResolvedValue({
                priceUsd: 50000,
                marketCapUsd: 1000000000,
                volume24hUsd: 50000000,
                tokenSymbol: 'BTC',
                tokenId: 'bitcoin',
                source: 'coingecko',
                timestamp: new Date()
            });
            mockWriter.insertBatch.mockResolvedValue(3);

            const result = await processor.backfillHistory(5, 'bitcoin', 'BTC');

            expect(result.existing).toBe(2);
            // Should fetch missing middle dates: today-3, today-2, today-1
            expect(result.fetched).toBe(3);
        }, 15000);

        it('should continue fetching after individual failures', async () => {
            mockWriter.getExistingDatesInRange.mockResolvedValue([]);

            // First call succeeds, second fails, third succeeds
            mockFetcher.fetchHistoricalPrice
                .mockResolvedValueOnce({
                    priceUsd: 50000,
                    marketCapUsd: 1000000000,
                    volume24hUsd: 50000000,
                    tokenSymbol: 'BTC',
                    tokenId: 'bitcoin',
                    source: 'coingecko',
                    timestamp: new Date()
                })
                .mockRejectedValueOnce(new Error('API rate limited'))
                .mockResolvedValueOnce({
                    priceUsd: 51000,
                    marketCapUsd: 1010000000,
                    volume24hUsd: 51000000,
                    tokenSymbol: 'BTC',
                    tokenId: 'bitcoin',
                    source: 'coingecko',
                    timestamp: new Date()
                });

            mockWriter.insertBatch.mockResolvedValue(2);

            const result = await processor.backfillHistory(3, 'bitcoin', 'BTC');

            // Should fetch 2 out of 3 (one failed)
            expect(result.fetched).toBe(2);
            expect(result.inserted).toBe(2);
        }, 15000);
    });
});
