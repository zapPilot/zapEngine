
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HyperliquidFetcher } from '../../../../src/modules/hyperliquid/fetcher.js';
import { deriveTvlFromPortfolio } from '../../../../src/modules/hyperliquid/fetcher.helpers.js';
import { CoinGeckoFetcher } from '../../../../src/modules/token-price/index.js';
import { DeFiLlamaFetcher } from '../../../../src/modules/pool/fetcher.js';

// Mock logger
vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

describe('Specific Fetchers', () => {

    describe('HyperliquidFetcher', () => {
        let fetcher: HyperliquidFetcher;

        beforeEach(() => {
            fetcher = new HyperliquidFetcher();
        });

        it('should handle missing follower state in extractPositionData', () => {
            const result = fetcher.extractPositionData({
                vaultAddress: '0x123',
                leader: '0xLead',
                apr: 0.1,
                followerState: null
            } as unknown, '0xUser');

            expect(result).toBeNull();
        });

        it('should handle invalid vault value in extractPositionData', () => {
            const result = fetcher.extractPositionData({
                vaultAddress: '0x123',
                followerState: { totalAccountValue: Infinity, vaultEquity: undefined }
            } as unknown, '0xUser');

            expect(result).toBeNull();
        });

        it('should derive TVL from portfolio history', () => {
            const result = deriveTvlFromPortfolio([
                ['day', { accountValueHistory: [[1000, 5000]] }]
            ]);
            expect(result).toBe(5000);
        });

        it('should return null for empty/invalid portfolio', () => {
            expect(deriveTvlFromPortfolio([])).toBeNull();
            expect(deriveTvlFromPortfolio([['day', {}]])).toBeNull();
        });
    });

    describe('CoinGeckoFetcher', () => {
        let fetcher: CoinGeckoFetcher;
        beforeEach(() => { fetcher = new CoinGeckoFetcher(); });

        it('should throw if current price response is missing USD field', async () => {
            const f = (fetcher as unknown);
            // Return valid schema but MISSING the token key we asked for (but has random other key to pass strict schema check if any?)
            // Schema is simple price response: dynamic keys.
            // If I return { ethereum: { usd: 100 } } when request was 'bitcoin',
            // response['bitcoin'] is undefined.
            f.fetchWithRetry = vi.fn().mockResolvedValue({
                ethereum: { usd: 100, usd_market_cap: 100, usd_24h_vol: 100 }
            });

            await expect(fetcher.fetchCurrentPrice('bitcoin')).rejects.toThrow('missing bitcoin.usd field');
        });

        it('should throw if historical price response is missing USD field', async () => {
            const f = (fetcher as unknown);
            f.fetchWithRetry = vi.fn().mockResolvedValue({ market_data: { current_price: {} } });
            await expect(fetcher.fetchHistoricalPrice('01-01-2024')).rejects.toThrow('missing market_data.current_price.usd');
        });
    });

    describe('DeFiLlamaFetcher', () => {
        let fetcher: DeFiLlamaFetcher;
        beforeEach(() => { fetcher = new DeFiLlamaFetcher(); });

        it('should transform pools and skip invalid ones', () => {
            const pools = [
                { chain: '', project: 'p1' }, // Invalid chain
                { chain: 'eth', project: 'p2', tvlUsd: 100 }
            ];
            // transformPools is private
            const result = (fetcher as unknown).transformPools(pools);
            expect(result).toHaveLength(1);
            expect(result[0].protocol).toBe('p2');
        });

        it('should handle findMatchingPool failure', async () => {
            (fetcher as unknown).fetchAllPools = vi.fn().mockResolvedValue([]);
            const result = await fetcher.findMatchingPool('eth', 'p1', '1', []);
            expect(result).toBeNull();
        });
    });
});
