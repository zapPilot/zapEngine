/* eslint-disable max-lines-per-function */
import defillamaResponse from './defillama-response.json';
import pendleResponse from './pendle-response.json';
import aaveResponse from './aave-response.json';
import type { PoolData } from '../../src/types/api.js';
import type { PoolAprSnapshotInsert } from '../../src/types/database.js';

/**
 * Test fixtures for API responses from various DeFi data sources
 * These fixtures represent realistic API responses for testing transformation logic
 */

export const fixturesData = {
  defillama: defillamaResponse,
  pendle: pendleResponse,
  aave: aaveResponse
} as const;

/**
 * Helper functions to create standardized test data
 */
export const createMockPoolData = (overrides: Partial<PoolData> = {}): PoolData => ({
  pool_address: '0x1234567890123456789012345678901234567890',
  protocol_address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
  chain: 'ethereum',
  protocol: 'test-protocol',
  symbol: 'ETH-USDC',
  underlying_tokens: ['0x1', '0x2'],
  tvl_usd: 1000000,
  apy: 0.05,
  apy_base: 0.03,
  apy_reward: 0.02,
  volume_usd_1d: 500000,
  exposure: 'multi',
  reward_tokens: ['0x3'],
  pool_meta: { type: 'test' },
  source: 'test',
  raw_data: { original: 'data' },
  ...overrides
});

/**
 * Pre-configured test scenarios for common use cases
 */
export const testScenarios = {
  // DeFiLlama test data - requires APY to APR conversion
  defillamaHighYield: createMockPoolData({
    source: 'defillama',
    pool_address: null,
    protocol_address: null,
    symbol: 'WMATIC-TRUMATIC-WMATIC-TRUMATIC',
    underlying_tokens: ['0x1', '0x2', '0x3'],
    apy: 0.39, // 39% APY - typical high DeFi yield
    apy_base: 0.15,
    apy_reward: 0.24,
    exposure: 'multi'
  }),

  // Standard lending protocol data
  aaveLending: createMockPoolData({
    source: 'aave',
    symbol: 'aUSDC',
    underlying_tokens: ['0xA0b86a33E6Ba9df23e45f42a4E9b8ffce85cfdc'],
    apy: 0.0245, // 2.45% - typical lending rate
    apy_base: 0.0245,
    apy_reward: null,
    exposure: 'single'
  }),

  // Pendle PT token data
  pendleFixedRate: createMockPoolData({
    source: 'pendle',
    symbol: 'PT-stETH',
    underlying_tokens: ['0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84'],
    apy: 0.0845, // 8.45% implied APY
    apy_base: 0.062,
    apy_reward: 0.0225,
    exposure: 'single'
  }),

  // Edge case: Zero yields (but valid TVL)
  zeroYield: createMockPoolData({
    tvl_usd: 1000000, // Valid TVL but zero yields
    apy: 0,
    apy_base: null,
    apy_reward: null,
    volume_usd_1d: null
  }),

  // Edge case: Invalid data
  invalidData: {
    pool_address: null,
    protocol_address: null,
    chain: '',
    protocol: '',
    symbol: '',
    underlying_tokens: null,
    tvl_usd: null,
    apy: NaN,
    apy_base: null,
    apy_reward: null,
    volume_usd_1d: null,
    exposure: null,
    reward_tokens: null,
    pool_meta: null,
    source: '',
    raw_data: null
  } as PoolData,

  // Extreme high yield (common in early DeFi protocols)
  extremeYield: createMockPoolData({
    source: 'defillama',
    apy: 5.0, // 500% APY
    apy_base: 2.0,
    apy_reward: 3.0,
    tvl_usd: 50000 // Low TVL often correlates with high yields
  }),

  // Complex multi-token LP
  complexLP: createMockPoolData({
    symbol: 'WETH-WBTC-USDC-DAI',
    underlying_tokens: [
      '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // WBTC
      '0xA0b86a33E6Ba9df23e45f42a4E9b8ffce85cfdc',   // USDC
      '0x6B175474E89094C44Da98b954EedeAC495271d0F'    // DAI
    ],
    apy: 0.08,
    exposure: 'multi',
    reward_tokens: [
      '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', // UNI
      '0xc00e94cb662c3520282e6f5717214004a7f26888'  // COMP
    ]
  }),

  // Hyphenated token names (edge case for symbol parsing)
  hyphenatedTokens: createMockPoolData({
    symbol: 'YFI-2X-FLI-COMPOUND-ETH',
    underlying_tokens: ['0x1', '0x2'], // Fewer tokens than symbol parts
    apy: 0.12
  })
} as const;

/**
 * Expected transformation results for test scenarios
 * These represent the expected output after transformation
 */
export const expectedTransformations = {
  defillamaHighYield: {
    chain: 'ethereum',
    protocol: 'test-protocol',
    symbol: 'wmatic-trumatic-wmatic-trumatic',
    symbols: ['WMATIC', 'TRUMATIC'], // Deduplicated
    apr: expect.closeTo(0.3293, 4), // Converted from 39% APY
    apr_base: expect.closeTo(0.1398, 4), // Converted from 15% APY
    apr_reward: expect.closeTo(0.2148, 4), // Converted from 24% APY
    source: 'defillama'
  },

  aaveLending: {
    chain: 'ethereum',
    symbol: 'ausdc',
    symbols: ['aUSDC'],
    apr: 0.0245, // No conversion for non-DeFiLlama
    source: 'aave'
  },

  pendleFixedRate: {
    symbol: 'pt-steth',
    symbols: ['PT-stETH'],
    apr: 0.0845, // No conversion for non-DeFiLlama
    source: 'pendle'
  }
} as const;

/**
 * Utility functions for test assertions
 */
export const testUtils = {
  /**
   * Checks if a transformation result matches expected financial precision
   */
  expectFinancialPrecision: (actual: number, expected: number, decimals = 4) => {
    expect(actual).toBeCloseTo(expected, decimals);
  },

  /**
   * Validates that all required fields are present and properly typed
   */
  expectValidTransformation: (result: Partial<PoolAprSnapshotInsert> | null | undefined) => {
    expect(result).toBeTruthy();
    if (!result) {
      return;
    }
    expect(result.chain).toEqual(expect.any(String));
    expect(result.protocol).toEqual(expect.any(String));
    expect(result.symbol).toEqual(expect.any(String));
    expect(result.apr).toEqual(expect.any(Number));
    expect(result.source).toEqual(expect.any(String));
    expect(result.snapshot_time).toBeDefined();
  },

  /**
   * Validates symbol parsing results
   */
  expectValidSymbolParsing: (result: { symbols?: string[] }, expectedSymbols: string[]) => {
    expect(result.symbols).toEqual(expectedSymbols);
    expect(Array.isArray(result.symbols)).toBe(true);
  }
};
