/**
 * Test fixtures for PoolData and related types
 * Provides realistic test data with known expected results for validation
 */

import type { PoolData } from '../../src/types/api.js';
import type { PoolAprSnapshotInsert } from '../../src/types/database.js';

/**
 * Valid pool data samples for testing transformations
 */
export const validPoolDataSamples: PoolData[] = [
  // DeFiLlama sample - typical case with all fields
  {
    pool_address: '0x1234567890abcdef1234567890abcdef12345678',
    protocol_address: '0xabcdef1234567890abcdef1234567890abcdef12',
    chain: 'ethereum',
    protocol: 'aave',
    symbol: 'USDC-DAI',
    underlying_tokens: ['USDC', 'DAI'],
    tvl_usd: 1500000.50,
    apy: 0.0543, // 5.43%
    apy_base: 0.0500, // 5.00%
    apy_reward: 0.0043, // 0.43%
    volume_usd_1d: 250000.75,
    exposure: 'stable',
    reward_tokens: ['AAVE', 'CRV'],
    pool_meta: {
      version: 'v3',
      collateral_factor: 0.85,
    },
    source: 'defillama',
    raw_data: { original_api_response: true },
  },

  // Pendle sample - missing optional fields
  {
    chain: 'arbitrum',
    protocol: 'pendle',
    symbol: 'PT-stETH-DEC2024',
    tvl_usd: 75000.0,
    apy: 0.0825, // 8.25%
    source: 'pendle',
  },

  // High APY case for validation testing
  {
    chain: 'polygon',
    protocol: 'quickswap',
    symbol: 'WMATIC-QUICK',
    underlying_tokens: ['WMATIC', 'QUICK'],
    tvl_usd: 50000.0,
    apy: 2.15, // 215% - extreme but valid
    source: 'defillama',
  },

  // Minimal valid case
  {
    chain: 'base',
    protocol: 'compound',
    symbol: 'cUSDC',
    apy: 0.0234, // 2.34%
    source: 'compound',
  },
];

/**
 * Invalid pool data samples for error handling tests
 */
export const invalidPoolDataSamples: Array<Partial<PoolData>> = [
  // Missing required fields
  {
    protocol: 'aave',
    symbol: 'USDC',
    apy: 0.05,
    source: 'defillama',
    // Missing chain
  },

  // Invalid APY
  {
    chain: 'ethereum',
    protocol: 'aave',
    symbol: 'USDC',
    apy: -0.05, // Negative APY
    source: 'defillama',
  },

  // Invalid TVL
  {
    chain: 'ethereum',
    protocol: 'aave',
    symbol: 'USDC',
    tvl_usd: -1000, // Negative TVL
    apy: 0.05,
    source: 'defillama',
  },

  // Empty required strings
  {
    chain: '',
    protocol: 'aave',
    symbol: 'USDC',
    apy: 0.05,
    source: 'defillama',
  },
];

/**
 * Expected transformation results for valid samples
 */
export const expectedTransformationResults: Partial<PoolAprSnapshotInsert>[] = [
  // Expected result for validPoolDataSamples[0] (DeFiLlama)
  {
    pool_address: '0x1234567890abcdef1234567890abcdef12345678',
    protocol_address: '0xabcdef1234567890abcdef1234567890abcdef12',
    chain: 'ethereum',
    protocol: 'aave',
    symbol: 'usdc-dai',
    symbols: ['USDC', 'DAI'],
    underlying_tokens: ['USDC', 'DAI'],
    tvl_usd: 1500000.50,
    // DeFiLlama APY (5.43%) converted to APR using daily compounding formula
    apr: 0.0527, // Approximately 5.27% (expect small variance due to conversion)
    apr_base: 0.0488, // Base converted
    apr_reward: 0.0043, // Reward converted
    volume_usd_1d: 250000.75,
    exposure: 'stable',
    reward_tokens: ['AAVE', 'CRV'],
    source: 'defillama',
  },

  // Expected result for validPoolDataSamples[1] (Pendle)
  {
    pool_address: null,
    protocol_address: null,
    chain: 'arbitrum',
    protocol: 'pendle',
    symbol: 'pt-steth-dec2024',
    symbols: ['pt-steth-dec2024'], // Single token symbol
    underlying_tokens: null,
    tvl_usd: 75000.0,
    apr: 0.0825, // Pendle: Use APY as APR directly
    apr_base: null,
    apr_reward: null,
    volume_usd_1d: null,
    exposure: null,
    reward_tokens: null,
    source: 'pendle',
  },
];

/**
 * APR/APY conversion test cases with precise expected values
 */
export interface ConversionTestCase {
  description: string;
  input: number;
  expected: number;
  tolerance: number; // Acceptable variance for floating point comparison
}

export const apyToAprTestCases: ConversionTestCase[] = [
  {
    description: '5% APY to APR (natural log conversion)',
    input: 0.05,
    expected: 0.04879, // ln(1.05) ≈ 0.04879
    tolerance: 0.00001,
  },
  {
    description: '10% APY to APR',
    input: 0.10,
    expected: 0.09531, // ln(1.10) ≈ 0.09531
    tolerance: 0.00001,
  },
  {
    description: '0% APY to APR',
    input: 0.0,
    expected: 0.0,
    tolerance: 0.0,
  },
];

export const dailyCompoundedApyToAprTestCases: ConversionTestCase[] = [
  {
    description: '5% daily-compounded APY to APR',
    input: 0.05,
    expected: 0.04879, // (1.05^(1/365) - 1) * 365 ≈ 0.04879
    tolerance: 0.00001,
  },
  {
    description: '12% daily-compounded APY to APR',
    input: 0.12,
    expected: 0.11335, // (1.12^(1/365) - 1) * 365 ≈ 0.11335
    tolerance: 0.00001,
  },
];

export const aprToApyTestCases: ConversionTestCase[] = [
  {
    description: '5% APR to APY (exponential conversion)',
    input: 0.05,
    expected: 0.05127, // e^0.05 - 1 ≈ 0.05127
    tolerance: 0.00001,
  },
];

/**
 * Symbol parsing test cases
 */
export interface SymbolTestCase {
  description: string;
  input: string;
  expected: string;
}

export const symbolNormalizationTestCases: SymbolTestCase[] = [
  {
    description: 'Remove parentheses',
    input: 'WETH(Bridged)',
    expected: 'weth',
  },
  {
    description: 'Remove brackets',
    input: 'DAI[Polygon]',
    expected: 'daipolygon',
  },
  {
    description: 'Remove "Bridged" keyword',
    input: 'USDC Bridged Token',
    expected: 'usdctoken',
  },
  {
    description: 'Normalize PT/YT prefixes',
    input: 'PT stETH Dec 2024',
    expected: 'pt-steth-dec-2024',
  },
  {
    description: 'Handle multiple spaces',
    input: 'WMATIC   QUICK    LP',
    expected: 'wmatic-quick-lp',
  },
];

export const symbolSimilarityTestCases: Array<{
  description: string;
  symbol1: string;
  symbol2: string;
  expectedSimilarity: number;
  tolerance: number;
}> = [
  {
    description: 'Identical symbols',
    symbol1: 'WETH-USDC',
    symbol2: 'WETH-USDC',
    expectedSimilarity: 1.0,
    tolerance: 0.0,
  },
  {
    description: 'Different order same tokens',
    symbol1: 'WETH-USDC',
    symbol2: 'USDC-WETH',
    expectedSimilarity: 1.0, // Should detect same tokens
    tolerance: 0.0,
  },
  {
    description: 'Partial overlap',
    symbol1: 'WETH-USDC',
    symbol2: 'WETH-DAI',
    expectedSimilarity: 0.5, // 50% overlap (WETH common)
    tolerance: 0.1,
  },
  {
    description: 'No overlap',
    symbol1: 'WETH-USDC',
    symbol2: 'MATIC-QUICK',
    expectedSimilarity: 0.0,
    tolerance: 0.0,
  },
];

/**
 * Chain name mapping test cases
 */
export const chainMappingTestCases: Array<{
  input: string;
  expected: string;
}> = [
  { input: 'ethereum', expected: 'ethereum' },
  { input: 'Ethereum', expected: 'ethereum' },
  { input: 'ARBITRUM', expected: 'arbitrum' },
  { input: 'bsc', expected: 'bsc' },
  { input: 'avalanche', expected: 'avax' },
  { input: 'unknown-chain', expected: 'unknown-chain' }, // Passthrough
];

/**
 * Database mock data for integration tests
 */
export const mockDatabaseInserts: PoolAprSnapshotInsert[] = [
  {
    pool_address: '0x1234567890abcdef1234567890abcdef12345678',
    protocol_address: '0xabcdef1234567890abcdef1234567890abcdef12',
    chain: 'ethereum',
    protocol: 'aave',
    symbol: 'usdc-dai',
    symbols: ['USDC', 'DAI'],
    underlying_tokens: ['USDC', 'DAI'],
    tvl_usd: 1500000.50,
    apr: 0.0527,
    apr_base: 0.0488,
    apr_reward: 0.0043,
    volume_usd_1d: 250000.75,
    exposure: 'stable',
    reward_tokens: ['AAVE', 'CRV'],
    pool_meta: { version: 'v3' },
    source: 'defillama',
    raw_data: null,
    snapshot_time: '2024-01-15T12:00:00.000Z',
  },
];
