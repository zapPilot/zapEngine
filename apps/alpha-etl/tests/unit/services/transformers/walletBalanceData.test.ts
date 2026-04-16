/* eslint-disable max-lines-per-function */
/**
 * Unit tests for WalletBalanceTransformer
 * Tests data transformation, validation, and batch processing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WalletBalanceTransformer } from '../../../../src/modules/wallet/balanceTransformer.js';
import type { WalletBalanceData } from '../../../../src/types/index.js';

// Mock the logger to prevent console output during tests
vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

// Mock the mask utility
vi.mock('../../../../src/utils/mask.js', () => ({
  maskWalletAddress: vi.fn((address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`),
}));

describe('WalletBalanceTransformer', () => {
  let transformer: WalletBalanceTransformer;

  beforeEach(() => {
    vi.clearAllMocks();
    transformer = new WalletBalanceTransformer();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  const createMockWalletBalanceData = (overrides: Partial<WalletBalanceData> = {}): WalletBalanceData => ({
    user_id: 'user1',
    user_wallet_address: '0x1234567890123456789012345678901234567890',
    token_address: '0xA0b86a33E6329f4b7e6e4f7e1a9e8c2d3b4c5e6f',
    id: '0xA0b86a33E6329f4b7e6e4f7e1a9e8c2d3b4c5e6f',
    chain: 'ETH',
    name: 'Ethereum',
    symbol: 'ETH',
    display_symbol: 'ETH',
    optimized_symbol: 'ETH',
    decimals: 18,
    logo_url: 'https://example.com/eth.png',
    protocol_id: 'ethereum',
    price: 1800.50,
    price_24h_change: 2.5,
    is_verified: true,
    is_core: true,
    is_wallet: true,
    time_at: 1640995200,
    amount: 5.25,
    raw_amount: '5250000000000000000',
    raw_amount_hex_str: '0x48c27395000',
    ...overrides,
  });

  describe('transform', () => {
    it('should transform wallet balance data successfully', async () => {
      const rawData = createMockWalletBalanceData();

      const result = transformer.transform(rawData);

      expect(result).not.toBeNull();
      expect(result).toEqual({
        ...rawData,
        name: 'ethereum', // lowercased
        symbol: 'eth', // lowercased
        display_symbol: 'eth', // lowercased
        optimized_symbol: 'eth', // lowercased
      });
    });

    it('should handle data with undefined optional fields', async () => {
      const rawData = createMockWalletBalanceData({
        display_symbol: undefined,
        optimized_symbol: undefined,
        logo_url: undefined,
        protocol_id: undefined,
        price: undefined,
        price_24h_change: undefined,
        time_at: undefined,
        raw_amount: undefined,
        raw_amount_hex_str: undefined,
      });

      const result = transformer.transform(rawData);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('ethereum');
      expect(result!.symbol).toBe('eth');
      expect(result!.display_symbol).toBeUndefined();
      expect(result!.optimized_symbol).toBeUndefined();
    });

    it('should handle data with null optional fields', async () => {
      const rawData = createMockWalletBalanceData({
        display_symbol: null as unknown,
        optimized_symbol: null as unknown,
        logo_url: null,
        protocol_id: null,
        price: null as unknown,
        price_24h_change: null as unknown,
        time_at: null as unknown,
        raw_amount: null as unknown,
        raw_amount_hex_str: null as unknown,
      });

      const result = transformer.transform(rawData);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('ethereum');
      expect(result!.symbol).toBe('eth');
      expect(result!.display_symbol).toBeUndefined();
      expect(result!.optimized_symbol).toBeUndefined();
    });

    it('should handle data with empty string fields', async () => {
      const rawData = createMockWalletBalanceData({
        name: '',
        symbol: '',
        display_symbol: '',
        optimized_symbol: '',
      });

      const result = transformer.transform(rawData);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('');
      expect(result!.symbol).toBe('');
      expect(result!.display_symbol).toBe('');
      expect(result!.optimized_symbol).toBe('');
    });

    it('should handle mixed case symbols and names', async () => {
      const rawData = createMockWalletBalanceData({
        name: 'USD Coin',
        symbol: 'USDC',
        display_symbol: 'USDC',
        optimized_symbol: 'usdc-optimized',
      });

      const result = transformer.transform(rawData);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('usd coin');
      expect(result!.symbol).toBe('usdc');
      expect(result!.display_symbol).toBe('usdc');
      expect(result!.optimized_symbol).toBe('usdc-optimized');
    });

    it('should handle special characters in token names and symbols', async () => {
      const rawData = createMockWalletBalanceData({
        name: 'Token-With_Special.Characters',
        symbol: 'TOKEN.SPECIAL',
        display_symbol: 'TOKEN_DISPLAY',
        optimized_symbol: 'token-optimized',
      });

      const result = transformer.transform(rawData);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('token-with_special.characters');
      expect(result!.symbol).toBe('token.special');
      expect(result!.display_symbol).toBe('token_display');
      expect(result!.optimized_symbol).toBe('token-optimized');
    });

    it('should preserve all other fields unchanged', async () => {
      const rawData = createMockWalletBalanceData({
        user_wallet_address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        token_address: '0x9999999999999999999999999999999999999999',
        chain: 'BSC',
        decimals: 6,
        amount: 1000.50,
        price: 0.99,
        is_verified: false,
        is_core: false,
        is_wallet: false,
      });

      const result = transformer.transform(rawData);

      expect(result).not.toBeNull();
      expect(result!.user_wallet_address).toBe('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd');
      expect(result!.token_address).toBe('0x9999999999999999999999999999999999999999');
      expect(result!.chain).toBe('BSC'); // Chain not lowercased
      expect(result!.decimals).toBe(6);
      expect(result!.amount).toBe(1000.50);
      expect(result!.price).toBe(0.99);
      expect(result!.is_verified).toBe(false);
      expect(result!.is_core).toBe(false);
      expect(result!.is_wallet).toBe(false);
    });

    it('should handle transformation errors gracefully', async () => {
      // Create data that will cause an error in the transformation
      const problematicData = {
        toString: () => { throw new Error('ToString failed'); }
      } as unknown;

      const result = transformer.transform(problematicData);

      expect(result).not.toBeNull();
    });

    it('should handle non-Error exceptions gracefully', async () => {
      const problematicData = {
        user_wallet_address: '0x1234567890123456789012345678901234567890',
        symbol: 'ETH',
        get name() {
          throw new Error('Non-Error failure');
        }
      } as unknown;

      const result = transformer.transform(problematicData);

      expect(result).toBeNull();
    });

    it('should handle null input', async () => {
      const result = transformer.transform(null as unknown);

      expect(result).toBeNull();
    });

    it('should handle undefined input', async () => {
      const result = transformer.transform(undefined as unknown);

      expect(result).toBeNull();
    });

    it('should handle objects with prototype pollution attempt', async () => {
      const maliciousData = createMockWalletBalanceData();
      (maliciousData as unknown).__proto__.polluted = 'value';

      const result = transformer.transform(maliciousData);

      expect(result).not.toBeNull();
      expect((result as unknown).polluted).toBe('value');
    });
  });

  describe('transformBatch', () => {
    it('should transform multiple wallet balance records', async () => {
      const rawDataList = [
        createMockWalletBalanceData({
          symbol: 'ETH',
          name: 'Ethereum'
        }),
        createMockWalletBalanceData({
          symbol: 'USDC',
          name: 'USD Coin'
        }),
        createMockWalletBalanceData({
          symbol: 'DAI',
          name: 'Dai Stablecoin'
        }),
      ];

      const result = transformer.transformBatch(rawDataList);

      expect(result).toHaveLength(3);
      expect(result[0].symbol).toBe('eth');
      expect(result[0].name).toBe('ethereum');
      expect(result[1].symbol).toBe('usdc');
      expect(result[1].name).toBe('usd coin');
      expect(result[2].symbol).toBe('dai');
      expect(result[2].name).toBe('dai stablecoin');
    });

    it('should handle empty input array', async () => {
      const result = transformer.transformBatch([]);

      expect(result).toEqual([]);
    });

    it('should filter out failed transformations', async () => {
      const rawDataList = [
        createMockWalletBalanceData({ symbol: 'ETH' }),
        null as unknown, // This will fail transformation
        createMockWalletBalanceData({ symbol: 'DAI' }),
        undefined as unknown, // This will also fail
        createMockWalletBalanceData({ symbol: 'USDC' }),
      ];

      const result = transformer.transformBatch(rawDataList);

      expect(result).toHaveLength(3);
      expect(result.map(r => r.symbol)).toEqual(['eth', 'dai', 'usdc']);
    });

    it('should handle all failed transformations', async () => {
      const rawDataList = [
        null as unknown,
        undefined as unknown,
        'invalid data' as unknown,
      ];

      const result = transformer.transformBatch(rawDataList);

      expect(result).toEqual([]);
    });

    it('should handle large batches efficiently', async () => {
      const rawDataList = Array.from({ length: 10000 }, (_, index) =>
        createMockWalletBalanceData({
          symbol: `TOKEN${index}`,
          name: `Token ${index}`
        })
      );

      const result = transformer.transformBatch(rawDataList);

      expect(result).toHaveLength(10000);
      expect(result[0].symbol).toBe('token0');
      expect(result[0].name).toBe('token 0');
      expect(result[9999].symbol).toBe('token9999');
      expect(result[9999].name).toBe('token 9999');
    });

    it('should maintain order in batch processing', async () => {
      const rawDataList = [
        createMockWalletBalanceData({ symbol: 'FIRST' }),
        createMockWalletBalanceData({ symbol: 'SECOND' }),
        createMockWalletBalanceData({ symbol: 'THIRD' }),
      ];

      const result = transformer.transformBatch(rawDataList);

      expect(result).toHaveLength(3);
      expect(result[0].symbol).toBe('first');
      expect(result[1].symbol).toBe('second');
      expect(result[2].symbol).toBe('third');
    });

    it('should handle mixed success and failure in batch', async () => {
      const rawDataList = [
        createMockWalletBalanceData({ symbol: 'ETH' }),
        null as unknown, // Failure
        createMockWalletBalanceData({ symbol: 'DAI' }),
        undefined as unknown, // Failure
        createMockWalletBalanceData({ symbol: 'USDC' }),
        'invalid' as unknown, // Failure
        createMockWalletBalanceData({ symbol: 'BTC' }),
      ];

      const result = transformer.transformBatch(rawDataList);

      expect(result).toHaveLength(4);
      expect(result.map(r => r.symbol)).toEqual(['eth', 'dai', 'usdc', 'btc']);
    });
  });

  describe('edge cases and boundary conditions', () => {
    it('should handle extremely long strings', async () => {
      const longString = 'a'.repeat(10000);
      const rawData = createMockWalletBalanceData({
        name: longString,
        symbol: longString,
        display_symbol: longString,
      });

      const result = transformer.transform(rawData);

      expect(result).not.toBeNull();
      expect(result!.name).toBe(longString);
      expect(result!.symbol).toBe(longString);
      expect(result!.display_symbol).toBe(longString);
    });

    it('should handle unicode characters', async () => {
      const rawData = createMockWalletBalanceData({
        name: 'Tökén Ñáme 🚀',
        symbol: 'TKN🎯',
        display_symbol: 'TKN-显示',
      });

      const result = transformer.transform(rawData);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('tökén ñáme 🚀');
      expect(result!.symbol).toBe('tkn🎯');
      expect(result!.display_symbol).toBe('tkn-显示');
    });

    it('should handle numeric values as strings in string fields', async () => {
      const rawData = createMockWalletBalanceData({
        name: '12345' as unknown,
        symbol: '67890' as unknown,
        display_symbol: '111' as unknown,
      });

      const result = transformer.transform(rawData);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('12345');
      expect(result!.symbol).toBe('67890');
      expect(result!.display_symbol).toBe('111');
    });

    it('should handle boolean values in string fields', async () => {
      const rawData = createMockWalletBalanceData({
        name: true as unknown,
        symbol: false as unknown,
      });

      const result = transformer.transform(rawData);

      expect(result).toBeNull();
    });

    it('should handle array-like objects', async () => {
      const arrayLikeData = {
        ...createMockWalletBalanceData(),
        length: 5, // Array-like property
        0: 'first',
        1: 'second',
      };

      const result = transformer.transform(arrayLikeData);

      expect(result).not.toBeNull();
      expect(result!.user_id).toBe('user1'); // Original data preserved
    });

    it('should handle objects with circular references', async () => {
      const circularData = createMockWalletBalanceData();
      (circularData as unknown).self = circularData;

      const result = transformer.transform(circularData);

      expect(result).not.toBeNull();
      expect(result!.user_id).toBe('user1');
    });

    it('should handle very large numeric values', async () => {
      const rawData = createMockWalletBalanceData({
        amount: Number.MAX_SAFE_INTEGER,
        price: Number.MAX_SAFE_INTEGER,
        decimals: Number.MAX_SAFE_INTEGER,
      });

      const result = transformer.transform(rawData);

      expect(result).not.toBeNull();
      expect(result!.amount).toBe(Number.MAX_SAFE_INTEGER);
      expect(result!.price).toBe(Number.MAX_SAFE_INTEGER);
      expect(result!.decimals).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should handle NaN and Infinity values', async () => {
      const rawData = createMockWalletBalanceData({
        amount: NaN,
        price: Infinity,
        price_24h_change: -Infinity,
      });

      const result = transformer.transform(rawData);

      expect(result).not.toBeNull();
      expect(Number.isNaN(result!.amount)).toBe(true);
      expect(result!.price).toBe(Infinity);
      expect(result!.price_24h_change).toBe(-Infinity);
    });
  });

  describe('performance considerations', () => {
    it('should handle concurrent transformations without interference', async () => {
      const rawData1 = createMockWalletBalanceData({ user_id: 'user1', symbol: 'ETH' });
      const rawData2 = createMockWalletBalanceData({ user_id: 'user2', symbol: 'USDC' });

      const [result1, result2] = await Promise.all([
        Promise.resolve(transformer.transform(rawData1)),
        Promise.resolve(transformer.transform(rawData2)),
      ]);

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
      expect(result1!.user_id).toBe('user1');
      expect(result1!.symbol).toBe('eth');
      expect(result2!.user_id).toBe('user2');
      expect(result2!.symbol).toBe('usdc');
    });

    it('should not retain references to input data', async () => {
      const rawData = createMockWalletBalanceData();
      const originalSymbol = rawData.symbol;

      const result = transformer.transform(rawData);

      // Modify original data after transformation
      rawData.symbol = 'MODIFIED';

      expect(result).not.toBeNull();
      // Result should NOT be affected by changes to input (independent object)
      expect(result!.symbol).toBe(originalSymbol.toLowerCase());
      expect(result!.symbol).not.toBe('MODIFIED');
    });
  });

  describe('additional edge cases', () => {
    it('should handle whitespace in string fields', () => {
      const rawData = createMockWalletBalanceData({
        name: '  Ethereum  ',
        symbol: '  ETH  ',
        display_symbol: '\tETH\t',
        optimized_symbol: '\nETH\n',
      });

      const result = transformer.transform(rawData);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('  ethereum  ');
      expect(result!.symbol).toBe('  eth  ');
      expect(result!.display_symbol).toBe('\teth\t');
      expect(result!.optimized_symbol).toBe('\neth\n');
    });

    it('should handle zero and negative numeric values', () => {
      const testCases = [
        { amount: 0, price: 0, decimals: 0 },
        { amount: -1, price: -100, decimals: -5 },
        { amount: 0.0000001, price: 0.00001, decimals: 18 },
      ];

      testCases.forEach((testCase) => {
        const rawData = createMockWalletBalanceData(testCase);
        const result = transformer.transform(rawData);

        expect(result).not.toBeNull();
        expect(result!.amount).toBe(testCase.amount);
        expect(result!.price).toBe(testCase.price);
        expect(result!.decimals).toBe(testCase.decimals);
      });
    });

    it('should handle chain field variations', () => {
      const testCases = [
        { chain: 'ETH', expected: 'ETH' },  // Not lowercased
        { chain: 'ethereum', expected: 'ethereum' },
        { chain: 'POLYGON', expected: 'POLYGON' },
        { chain: '', expected: '' },
      ];

      testCases.forEach((testCase) => {
        const rawData = createMockWalletBalanceData({ chain: testCase.chain });
        const result = transformer.transform(rawData);

        expect(result).not.toBeNull();
        expect(result!.chain).toBe(testCase.expected);
      });
    });

    it('should handle missing user_id field', () => {
      const rawData = createMockWalletBalanceData({ user_id: '' });
      const result = transformer.transform(rawData);

      expect(result).not.toBeNull();
      expect(result!.user_id).toBe('');
    });

    it('should handle missing wallet address field', () => {
      const rawData = createMockWalletBalanceData({ user_wallet_address: '' });
      const result = transformer.transform(rawData);

      expect(result).not.toBeNull();
      expect(result!.user_wallet_address).toBe('');
    });

    it('should handle strings with only whitespace', () => {
      const rawData = createMockWalletBalanceData({
        name: '   ',
        symbol: '\t\t',
        display_symbol: '\n\n',
        optimized_symbol: '  \t\n  ',
      });

      const result = transformer.transform(rawData);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('   ');
      expect(result!.symbol).toBe('\t\t');
      expect(result!.display_symbol).toBe('\n\n');
      expect(result!.optimized_symbol).toBe('  \t\n  ');
    });

    it('should handle very small decimal prices and amounts', () => {
      const rawData = createMockWalletBalanceData({
        price: 0.000000000001,
        amount: 0.000000000000001,
        price_24h_change: -0.0000001,
      });

      const result = transformer.transform(rawData);

      expect(result).not.toBeNull();
      expect(result!.price).toBe(0.000000000001);
      expect(result!.amount).toBe(0.000000000000001);
      expect(result!.price_24h_change).toBe(-0.0000001);
    });

    it('should handle protocol_id variations', () => {
      const testCases = [
        { protocol_id: 'uniswap', expected: 'uniswap' },
        { protocol_id: '', expected: '' },
        { protocol_id: null, expected: null },
        { protocol_id: undefined, expected: undefined },
      ];

      testCases.forEach((testCase) => {
        const rawData = createMockWalletBalanceData({ protocol_id: testCase.protocol_id as unknown });
        const result = transformer.transform(rawData);

        expect(result).not.toBeNull();
        expect(result!.protocol_id).toBe(testCase.expected);
      });
    });

    it('should handle is_verified, is_core, is_wallet boolean variations', () => {
      const testCases = [
        { is_verified: true, is_core: true, is_wallet: true },
        { is_verified: false, is_core: false, is_wallet: false },
        { is_verified: true, is_core: false, is_wallet: true },
      ];

      testCases.forEach((testCase) => {
        const rawData = createMockWalletBalanceData(testCase);
        const result = transformer.transform(rawData);

        expect(result).not.toBeNull();
        expect(result!.is_verified).toBe(testCase.is_verified);
        expect(result!.is_core).toBe(testCase.is_core);
        expect(result!.is_wallet).toBe(testCase.is_wallet);
      });
    });

    it('should handle time_at edge cases', () => {
      const testCases = [
        { time_at: 0 },  // Unix epoch
        { time_at: null },
        { time_at: undefined },
        { time_at: 2147483647 },  // Max 32-bit timestamp
      ];

      testCases.forEach((testCase) => {
        const rawData = createMockWalletBalanceData({ time_at: testCase.time_at as unknown });
        const result = transformer.transform(rawData);

        expect(result).not.toBeNull();
        expect(result!.time_at).toBe(testCase.time_at);
      });
    });
  });
});
