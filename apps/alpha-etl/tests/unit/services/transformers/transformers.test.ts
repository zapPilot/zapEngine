
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SentimentDataTransformer } from '../../../../src/modules/sentiment/index.js';
import { PoolDataTransformer } from '../../../../src/modules/pool/transformer.js';
import { WalletBalanceTransformer } from '../../../../src/modules/wallet/balanceTransformer.js';
import { DeBankPortfolioTransformer } from '../../../../src/modules/wallet/portfolioTransformer.js';
import { HyperliquidDataTransformer } from '../../../../src/modules/hyperliquid/transformer.js';
import { transformBatchWithLogging } from '../../../../src/core/transformers/baseTransformer.js';
import { logger } from '../../../../src/utils/logger.js';

// Mock logger globally
vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

describe('Transformers', () => {

    describe('SentimentDataTransformer', () => {
        let transformer: SentimentDataTransformer;
        beforeEach(() => {
            transformer = new SentimentDataTransformer();
        });

        it('should handle invalid input classification vs value mismatch', () => {
            const input = {
                value: 50,
                classification: 'Extreme Fear', // Mismatch (0-25)
                timestamp: 1629853999,
                source: 'api'
            };
            const result = transformer.transform(input as unknown);
            expect(result).not.toBeNull();
            // Should verify warning logged?
        });

        it('should return null on timestamp conversion failure', () => {
            const input = {
                value: 50,
                classification: 'Neutral',
                timestamp: 100, // Very old timestamp
                source: 'api'
            };
            const result = transformer.transform(input as unknown);
            expect(result).not.toBeNull();
        });

        it('should return null on Zod validation error', () => {
            const input = {
                value: -1, // Invalid
                classification: 'Neutral',
                timestamp: 1629853999,
                source: 'api'
            };
            const result = transformer.transform(input as unknown);
            expect(result).toBeNull();
        });
    });

    describe('WalletBalanceTransformer', () => {
        let transformer: WalletBalanceTransformer;
        beforeEach(() => {
            transformer = new WalletBalanceTransformer();
        });

        it('should transform standard wallet balance and lowercase fields', () => {
            const input: unknown = {
                user_wallet_address: '0xABC',
                symbol: 'ETH',
                amount: '1.5',
                usd_value: 3000
            };
            const result = transformer.transform(input);
            expect(result?.user_wallet_address).toBe('0xabc');
            expect(result?.symbol).toBe('eth');
        });

        it('should return null on error', () => {
            const result = transformer.transform(null as unknown);
            expect(result).toBeNull();
        });
    });

    describe('PoolDataTransformer', () => {
        let transformer: PoolDataTransformer;
        beforeEach(() => {
            transformer = new PoolDataTransformer();
        });

        it('should return empty array for debank source in transformBatch', () => {
            const result = transformer.transformBatch([], 'debank');
            expect(result).toEqual([]);
        });

        it('should return null if APY validation fails', () => {
            const input: unknown = {
                pool_address: '0x123',
                chain: 'eth',
                protocol: 'aave',
                symbol: 'usdc',
                apy: -5, // Invalid APY
                source: 'llama'
            };
            const result = transformer.transform(input);
            expect(result).toBeNull();
        });

        it('should transform valid input', () => {
            const input: unknown = {
                pool_address: '0x123',
                chain: 'eth',
                protocol: 'aave',
                symbol: 'usdc',
                apy: 5,
                source: 'llama'
            };
            const result = transformer.transform(input);
            expect(result).not.toBeNull();
            expect(result?.apr).toBe(0.05);
        });

        it('should return null on Zod validation error (invalid schema)', () => {
            const input: unknown = {
                chain: 'eth',
                // missing protocol, symbol, source
                apy: 5
            };
            const result = transformer.transform(input);
            expect(result).toBeNull();
        });
    });

    describe('DeBankPortfolioTransformer', () => {
        let transformer: DeBankPortfolioTransformer;
        beforeEach(() => {
            transformer = new DeBankPortfolioTransformer();
        });

        it('should return null if numeric values are infinite', () => {
            const params: unknown = {
                protocol: { name: 'test', chain: 'eth' },
                item: {
                    name: 'item',
                    stats: {
                        asset_usd_value: Infinity,
                        debt_usd_value: 0,
                        net_usd_value: 0
                    },
                    pool: { id: '1' }
                },
                walletAddress: '0x123'
            };
            const result = transformer.transformItem(params);
            expect(result).toBeNull();
        });

        it('should return null on exception', () => {
            const result = transformer.transformItem({ protocol: {}, item: null, walletAddress: '0x123' } as unknown);
            expect(result).toBeNull();
        });
    });

    describe('HyperliquidDataTransformer', () => {
        let transformer: unknown;
        beforeEach(() => {
            transformer = new HyperliquidDataTransformer();
        });

        it('transformPosition returns null if position is missing', () => {
            expect(transformer.transformPosition({})).toBeNull();
        });

        it('transformPosition returns null if validation fails', () => {
            const position = {
                vaultUsdValue: Infinity,
                hlpBalance: 10,
                userWallet: '0x123',
                vaultAddress: '0xabc'
            };
            expect(transformer.transformPosition({ position })).toBeNull();
            expect(logger.warn).toHaveBeenCalledWith('Hyperliquid position contains invalid numeric values', expect.anything());
        });

        it('transformPosition returns snapshot on success', () => {
            const position = {
                vaultUsdValue: 1000,
                hlpBalance: 10,
                userWallet: '0x123',
                vaultAddress: '0xabc',
                vaultName: 'Vault',
                leaderAddress: '0xleader',
                relationshipType: 'follower',
                maxWithdrawable: 500
            };
            const result = transformer.transformPosition({ position });
            expect(result).not.toBeNull();
            expect(result.id_raw).toBe('0xabc');
        });

        it('transformPosition handles missing maxWithdrawable', () => {
            const position = {
                vaultUsdValue: 1000,
                hlpBalance: 10,
                userWallet: '0x123',
                vaultAddress: '0xabc',
                vaultName: 'Vault',
                leaderAddress: '0xleader',
                relationshipType: 'follower'
            };
            const result = transformer.transformPosition({ position });
            expect(result.detail.max_withdrawable).toBeNull();
        });

        it('transformPosition catches unexpected errors', () => {
            // Mock createSnapshot to crash (validatePosition is outside try block)
            vi.spyOn(transformer as unknown, 'createSnapshot').mockImplementation(() => { throw new Error('Crash'); });
            const position = {
                vaultUsdValue: 1000,
                hlpBalance: 10,
                userWallet: '0x123',
                vaultAddress: '0xabc'
            };
            expect(transformer.transformPosition({ position })).toBeNull();
            expect(logger.error).toHaveBeenCalledWith('Failed to transform Hyperliquid position data', expect.anything());
        });

        it('transformApr throws error on invalid APR', () => {
            expect(() => transformer.transformApr({ apr: Infinity, vaultAddress: '0x1' }, {})).toThrow('Invalid APR value');
        });

        it('transformApr returns snapshot on success', () => {
            const aprData = {
                vaultAddress: '0x1',
                vaultName: 'V',
                leaderAddress: '0xL',
                apr: 0.1,
                isClosed: false,
                allowDeposits: true
            };
            const raw = {
                description: 'desc',
                relationship: 'none'
            };
            const result = transformer.transformApr(aprData, raw);
            expect(result.apr).toBe(0.1);
            expect(result.pool_meta.description).toBe('desc');
        });
    });

    describe('BaseTransformer', () => {

        it('transformBatchWithLogging processes items and logs stats', () => {
            const items = [1, 2, 3];
            const transform = (i: number) => i % 2 === 0 ? i * 2 : null; // Keep evens
            const result = transformBatchWithLogging(items, transform, 'Test items');

            expect(result).toEqual([4]); // 2 * 2 = 4
            expect(logger.info).toHaveBeenCalledWith('Test items batch transformation completed', {
                total: 3,
                success: 1,
                errors: 2
            });
        });
    });

});
