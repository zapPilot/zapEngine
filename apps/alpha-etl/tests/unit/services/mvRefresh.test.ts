import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MaterializedViewRefresher, mvRefresher } from '../../../src/modules/core/mvRefresh.js';

// Mock database with custom MV_REFRESH_CONFIG for testing
vi.mock('../../../src/config/database.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../src/config/database.js')>();
    return {
        ...actual,
        getDbClient: vi.fn(),
        MV_REFRESH_CONFIG: {
            MATERIALIZED_VIEWS: [
                { name: 'alpha_raw.daily_wallet_token_snapshots' },
                { name: 'public.daily_portfolio_snapshots' },
                { name: 'public.portfolio_category_trend_mv' }
            ],
            MAX_RETRIES: 2,
            RETRY_BASE_DELAY_MS: 10 // Short delay for tests
        }
    };
});

// Mock logger
vi.mock('../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../setup/mocks.js');
  return mockLogger();
});

// Mock environment
vi.mock('../../../src/config/environment.js', () => ({
    env: {
        ENABLE_MV_REFRESH: true
    }
}));

import { getDbClient } from '../../../src/config/database.js';
import { env } from '../../../src/config/environment.js';

describe('MaterializedViewRefresher', () => {
    let refresher: MaterializedViewRefresher;
    let mockClient: {
        query: ReturnType<typeof vi.fn>;
        release: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();

        mockClient = {
            query: vi.fn().mockResolvedValue({}),
            release: vi.fn()
        };

        vi.mocked(getDbClient).mockResolvedValue(mockClient as unknown);
        refresher = new MaterializedViewRefresher();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('refreshAllViews', () => {
        it('should return early with success stats when MV refresh is disabled', async () => {
            // Disable MV refresh
            (env as unknown).ENABLE_MV_REFRESH = false;

            const result = await refresher.refreshAllViews('test-job-1');

            expect(result).toEqual({
                totalDurationMs: 0,
                results: [],
                allSucceeded: true,
                failedCount: 0,
                skippedCount: 0
            });

            // Restore
            (env as unknown).ENABLE_MV_REFRESH = true;
        });

        it('should refresh all MVs sequentially when enabled', async () => {
            const result = await refresher.refreshAllViews('test-job-2');

            expect(result.allSucceeded).toBe(true);
            expect(result.failedCount).toBe(0);
            expect(result.skippedCount).toBe(0);
            expect(result.results).toHaveLength(3);

            // Verify each MV was refreshed
            expect(result.results[0].mvName).toBe('alpha_raw.daily_wallet_token_snapshots');
            expect(result.results[0].success).toBe(true);
            expect(result.results[1].mvName).toBe('public.daily_portfolio_snapshots');
            expect(result.results[1].success).toBe(true);
            expect(result.results[2].mvName).toBe('public.portfolio_category_trend_mv');
            expect(result.results[2].success).toBe(true);

            // Verify REFRESH queries were called for each MV
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('REFRESH MATERIALIZED VIEW CONCURRENTLY alpha_raw.daily_wallet_token_snapshots')
            );
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('REFRESH MATERIALIZED VIEW CONCURRENTLY public.daily_portfolio_snapshots')
            );
            expect(mockClient.query).toHaveBeenCalledWith(
                expect.stringContaining('REFRESH MATERIALIZED VIEW CONCURRENTLY public.portfolio_category_trend_mv')
            );
        });

        it('should abort remaining MVs after first failure (abort-on-failure)', async () => {
            // Second MV always fails (all retries)
            mockClient.query.mockImplementation((query: string) => {
                if (query.includes('REFRESH MATERIALIZED VIEW CONCURRENTLY public.daily_portfolio_snapshots')) {
                    // Second MV refresh always fails
                    return Promise.reject(new Error('MV refresh timeout'));
                }
                return Promise.resolve({});
            });

            // Fast-forward timers for retry delays
            const resultPromise = refresher.refreshAllViews('test-job-3');
            await vi.runAllTimersAsync();
            const result = await resultPromise;

            expect(result.allSucceeded).toBe(false);
            expect(result.failedCount).toBe(1);  // Second MV failed
            expect(result.skippedCount).toBe(1); // Third MV skipped
            expect(result.results).toHaveLength(3);

            // First MV succeeded
            expect(result.results[0].success).toBe(true);
            expect(result.results[0].skipped).toBeUndefined();

            // Second MV failed after retries
            expect(result.results[1].success).toBe(false);
            expect(result.results[1].skipped).toBeUndefined();
            expect(result.results[1].error).toContain('Failed after');

            // Third MV skipped
            expect(result.results[2].success).toBe(false);
            expect(result.results[2].skipped).toBe(true);
            expect(result.results[2].error).toBe('Skipped due to previous MV failure');
        });

        it('should correctly track failed and skipped counts', async () => {
            // All MVs fail
            mockClient.query.mockImplementation((query: string) => {
                if (query.includes('REFRESH MATERIALIZED VIEW')) {
                    return Promise.reject(new Error('Connection error'));
                }
                return Promise.resolve({});
            });

            const resultPromise = refresher.refreshAllViews('test-job-4');
            await vi.runAllTimersAsync();
            const result = await resultPromise;

            expect(result.allSucceeded).toBe(false);
            expect(result.failedCount).toBe(1);  // First MV failed
            expect(result.skippedCount).toBe(2); // Remaining 2 MVs skipped
            expect(result.results).toHaveLength(3);
        });

        it('should calculate total duration correctly', async () => {
            const resultPromise = refresher.refreshAllViews('test-job-5');

            // Advance timer by 100ms
            await vi.advanceTimersByTimeAsync(100);
            const result = await resultPromise;

            expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
        });
    });

    describe('refreshViewWithRetry', () => {
        it('should return success result on first try', async () => {
            // Access private method via any
            const result = await (refresher as unknown).refreshViewWithRetry(
                'test_mv',
                'test-job-6'
            );

            expect(result.success).toBe(true);
            expect(result.mvName).toBe('test_mv');
            expect(result.durationMs).toBeGreaterThanOrEqual(0);
        });

        it('should retry with exponential backoff on failure', async () => {
            let attemptCount = 0;
            mockClient.query.mockImplementation((query: string) => {
                if (query.includes('REFRESH MATERIALIZED VIEW')) {
                    attemptCount++;
                    if (attemptCount < 3) {
                        return Promise.reject(new Error('Temporary failure'));
                    }
                    return Promise.resolve({});
                }
                return Promise.resolve({});
            });

            const resultPromise = (refresher as unknown).refreshViewWithRetry(
                'test_mv',
                'test-job-7'
            );

            // Run all timers to complete retries
            await vi.runAllTimersAsync();
            const result = await resultPromise;

            expect(result.success).toBe(true);
            expect(attemptCount).toBe(3); // Initial + 2 retries
        });

        it('should return failure after exhausting retries', async () => {
            mockClient.query.mockImplementation((query: string) => {
                if (query.includes('REFRESH MATERIALIZED VIEW')) {
                    return Promise.reject(new Error('Persistent failure'));
                }
                return Promise.resolve({});
            });

            const resultPromise = (refresher as unknown).refreshViewWithRetry(
                'test_mv',
                'test-job-8'
            );

            await vi.runAllTimersAsync();
            const result = await resultPromise;

            expect(result.success).toBe(false);
            expect(result.mvName).toBe('test_mv');
            expect(result.error).toContain('Failed after 3 attempts');
            expect(result.error).toContain('Persistent failure');
        });

        it('should handle non-Error failures and skip client release when no client is acquired', async () => {
            vi.mocked(getDbClient).mockRejectedValue('DB unreachable');

            const resultPromise = (refresher as unknown).refreshViewWithRetry(
                'test_mv',
                'test-job-non-error'
            );

            await vi.runAllTimersAsync();
            const result = await resultPromise;

            expect(result.success).toBe(false);
            expect(result.error).toContain('DB unreachable');
            expect(mockClient.release).not.toHaveBeenCalled();
        });
    });

    describe('refreshView', () => {
        it('should refresh MV and release client', async () => {
            await (refresher as unknown).refreshView('test_mv', 'test-job-9');

            // Verify refresh was called
            expect(mockClient.query).toHaveBeenCalledWith('REFRESH MATERIALIZED VIEW CONCURRENTLY test_mv');
            // Verify client was released
            expect(mockClient.release).toHaveBeenCalled();
        });

        it('should release client even on error', async () => {
            mockClient.query.mockImplementation((query: string) => {
                if (query.includes('REFRESH')) {
                    return Promise.reject(new Error('Refresh failed'));
                }
                return Promise.resolve({});
            });

            await expect(
                (refresher as unknown).refreshView('test_mv', 'test-job-10')
            ).rejects.toThrow('Refresh failed');

            expect(mockClient.release).toHaveBeenCalled();
        });
    });

    describe('static methods', () => {
        it('isEnabled() should reflect env config', () => {
            (env as unknown).ENABLE_MV_REFRESH = true;
            expect(MaterializedViewRefresher.isEnabled()).toBe(true);

            (env as unknown).ENABLE_MV_REFRESH = false;
            expect(MaterializedViewRefresher.isEnabled()).toBe(false);

            // Restore
            (env as unknown).ENABLE_MV_REFRESH = true;
        });

        it('getMaterializedViews() should return configured MVs', () => {
            const mvs = MaterializedViewRefresher.getMaterializedViews();

            expect(mvs).toEqual([
                'alpha_raw.daily_wallet_token_snapshots',
                'public.daily_portfolio_snapshots',
                'public.portfolio_category_trend_mv'
            ]);
        });
    });

    describe('singleton instance', () => {
        it('mvRefresher should be an instance of MaterializedViewRefresher', () => {
            expect(mvRefresher).toBeInstanceOf(MaterializedViewRefresher);
        });
    });
});
