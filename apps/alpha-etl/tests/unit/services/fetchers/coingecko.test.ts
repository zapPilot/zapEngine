import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CoinGeckoFetcher } from '../../../../src/modules/token-price/index.js';

// Mock logger
vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

describe('CoinGeckoFetcher', () => {
    let fetcher: CoinGeckoFetcher;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        fetcher = new CoinGeckoFetcher();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    describe('fetchCurrentPrice', () => {
        it('should fetch and return current price data', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({
                    bitcoin: {
                        usd: 97500,
                        usd_market_cap: 1900000000000,
                        usd_24h_vol: 45000000000
                    }
                })
            });

            const result = await fetcher.fetchCurrentPrice('bitcoin', 'BTC');

            expect(result.priceUsd).toBe(97500);
            expect(result.marketCapUsd).toBe(1900000000000);
            expect(result.volume24hUsd).toBe(45000000000);
            expect(result.tokenSymbol).toBe('BTC');
            expect(result.tokenId).toBe('bitcoin');
            expect(result.source).toBe('coingecko');
        });

        it('should handle different tokens', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({
                    ethereum: {
                        usd: 3500,
                        usd_market_cap: 420000000000,
                        usd_24h_vol: 15000000000
                    }
                })
            });

            const result = await fetcher.fetchCurrentPrice('ethereum', 'ETH');

            expect(result.priceUsd).toBe(3500);
            expect(result.tokenSymbol).toBe('ETH');
            expect(result.tokenId).toBe('ethereum');
        });

        it('should throw error on invalid response structure', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({
                    bitcoin: {} // Missing usd field
                })
            });

            await expect(fetcher.fetchCurrentPrice('bitcoin', 'BTC'))
                .rejects.toThrow('Invalid CoinGecko response');
        });

        it('should throw error on API failure', async () => {
            fetchMock.mockResolvedValue({
                ok: false,
                status: 429,
                statusText: 'Too Many Requests'
            });

            await expect(fetcher.fetchCurrentPrice('bitcoin', 'BTC'))
                .rejects.toThrow();
        });

        it('should default to 0 for missing market_cap and volume', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({
                    bitcoin: {
                        usd: 97500
                        // Missing usd_market_cap and usd_24h_vol - tests lines 85-86
                    }
                })
            });

            const result = await fetcher.fetchCurrentPrice('bitcoin', 'BTC');

            expect(result.priceUsd).toBe(97500);
            expect(result.marketCapUsd).toBe(0);
            expect(result.volume24hUsd).toBe(0);
        });

        it('should throw error when Zod schema validation fails', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({
                    bitcoin: {
                        usd: "not-a-number", // Invalid type
                        usd_market_cap: 100,
                        usd_24h_vol: 100
                    }
                })
            });

            await expect(fetcher.fetchCurrentPrice('bitcoin', 'BTC'))
                .rejects.toThrow('Invalid CoinGecko response');
        });

        it('should use default parameters', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({
                    bitcoin: {
                        usd: 97500,
                        usd_market_cap: 1900000000000,
                        usd_24h_vol: 45000000000
                    }
                })
            });

            const result = await fetcher.fetchCurrentPrice();

            expect(result.tokenId).toBe('bitcoin');
            expect(result.tokenSymbol).toBe('BTC');
        });
    });

    describe('fetchHistoricalPrice', () => {
        it('should fetch historical price for a specific date', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({
                    id: 'bitcoin',
                    symbol: 'btc',
                    name: 'Bitcoin',
                    market_data: {
                        current_price: { usd: 45000 },
                        market_cap: { usd: 850000000000 },
                        total_volume: { usd: 25000000000 }
                    }
                })
            });

            const result = await fetcher.fetchHistoricalPrice('15-12-2024', 'bitcoin', 'BTC');

            expect(result.priceUsd).toBe(45000);
            expect(result.marketCapUsd).toBe(850000000000);
            expect(result.volume24hUsd).toBe(25000000000);
            expect(result.timestamp.getUTCDate()).toBe(15);
            expect(result.timestamp.getUTCMonth()).toBe(11); // December
        });

        it('should throw error on missing market_data', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({
                    id: 'bitcoin',
                    symbol: 'btc',
                    name: 'Bitcoin'
                    // No market_data
                })
            });

            await expect(fetcher.fetchHistoricalPrice('15-12-2024', 'bitcoin', 'BTC'))
                .rejects.toThrow('Invalid CoinGecko historical response');
        });

        it('should throw error on API failure', async () => {
            fetchMock.mockResolvedValue({
                ok: false,
                status: 404,
                statusText: 'Not Found'
            });

            await expect(fetcher.fetchHistoricalPrice('15-12-2024', 'bitcoin', 'BTC'))
                .rejects.toThrow();
        });

        it('should default to 0 for missing market_cap and volume in historical data', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({
                    id: 'bitcoin',
                    symbol: 'btc',
                    name: 'Bitcoin',
                    market_data: {
                        current_price: { usd: 45000 }
                        // Missing market_cap and total_volume - tests lines 143-144
                    }
                })
            });

            const result = await fetcher.fetchHistoricalPrice('15-12-2024', 'bitcoin', 'BTC');

            expect(result.priceUsd).toBe(45000);
            expect(result.marketCapUsd).toBe(0);
            expect(result.volume24hUsd).toBe(0);
        });
    });

    describe('formatDateForApi', () => {
        it('should format date as DD-MM-YYYY', () => {
            const date = new Date(Date.UTC(2024, 11, 15)); // Dec 15, 2024

            const formatted = fetcher.formatDateForApi(date);

            expect(formatted).toBe('15-12-2024');
        });

        it('should pad single digit day and month with zeros', () => {
            const date = new Date(Date.UTC(2024, 0, 5)); // Jan 5, 2024

            const formatted = fetcher.formatDateForApi(date);

            expect(formatted).toBe('05-01-2024');
        });
    });

    describe('healthCheck', () => {
        it('should return healthy when price is valid', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({
                    bitcoin: {
                        usd: 97500,
                        usd_market_cap: 1900000000000,
                        usd_24h_vol: 45000000000
                    }
                })
            });

            const result = await fetcher.healthCheck('bitcoin', 'BTC');

            expect(result.status).toBe('healthy');
            expect(result.details).toContain('97,500');
        });

        it('should return unhealthy when price is unrealistic (too low)', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({
                    bitcoin: {
                        usd: 500, // Unrealistic BTC price
                        usd_market_cap: 10000000000,
                        usd_24h_vol: 1000000000
                    }
                })
            });

            const result = await fetcher.healthCheck('bitcoin', 'BTC');

            expect(result.status).toBe('unhealthy');
            expect(result.details).toContain('unrealistic');
        });

        it('should return unhealthy on API error', async () => {
            fetchMock.mockRejectedValue(new Error('Network error'));

            const result = await fetcher.healthCheck('bitcoin', 'BTC');

            expect(result.status).toBe('unhealthy');
            expect(result.details).toContain('Network error');
        });

        it('should use default parameters', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({
                    bitcoin: {
                        usd: 97500,
                        usd_market_cap: 1900000000000,
                        usd_24h_vol: 45000000000
                    }
                })
            });

            const result = await fetcher.healthCheck();

            expect(result.status).toBe('healthy');
        });
    });
});
