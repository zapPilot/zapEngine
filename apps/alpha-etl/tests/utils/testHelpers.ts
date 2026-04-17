/**
 * Test utility functions and helpers
 * Provides common testing utilities for mocking, assertions, and data generation
 */

import { vi, type MockedFunction } from 'vitest';
import type { PoolData } from '../../src/types/index.js';
import type { PoolAprSnapshotInsert } from '../../src/types/database.js';

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

interface MockDatabase {
  client: {
    query: MockedFunction<() => unknown>;
    end: MockedFunction<() => unknown>;
  };
  mockQuery: MockedFunction<() => unknown>;
  mockEnd: MockedFunction<() => unknown>;
}

/**
 * Floating-point comparison with tolerance for financial calculations
 */
export const expectToBeCloseTo = (
  actual: number,
  expected: number,
  tolerance: number = 0.00001
): void => {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(
      `Expected ${actual} to be within ${tolerance} of ${expected}, but difference was ${diff}`
    );
  }
};

/**
 * Assert that two arrays contain the same elements (order independent)
 */
export const expectArraysToContainSameElements = <T>(
  actual: T[],
  expected: T[]
): void => {
  if (actual.length !== expected.length) {
    throw new Error(
      `Expected arrays to have same length. Actual: ${actual.length}, Expected: ${expected.length}`
    );
  }

  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();

  for (let i = 0; i < sortedActual.length; i++) {
    if (sortedActual[i] !== sortedExpected[i]) {
      throw new Error(
        `Arrays differ at index ${i}. Actual: ${sortedActual[i]}, Expected: ${sortedExpected[i]}`
      );
    }
  }
};

/**
 * Generate random pool data for property-based testing
 */
export const generateRandomPoolData = (overrides: Partial<PoolData> = {}): PoolData => {
  const chains = ['ethereum', 'arbitrum', 'polygon', 'base', 'optimism'];
  const protocols = ['aave', 'compound', 'pendle', 'curve', 'uniswap'];
  const symbols = ['WETH', 'USDC', 'DAI', 'USDT', 'WBTC'];

  const randomChain = pickRandom(chains);
  const randomProtocol = pickRandom(protocols);
  const symbol1 = pickRandom(symbols);
  const symbol2 = pickRandom(symbols);

  return {
    pool_address: `0x${Math.random().toString(16).slice(2, 42).padStart(40, '0')}`,
    protocol_address: `0x${Math.random().toString(16).slice(2, 42).padStart(40, '0')}`,
    chain: randomChain,
    protocol: randomProtocol,
    symbol: `${symbol1}-${symbol2}`,
    underlying_tokens: [symbol1, symbol2],
    tvl_usd: Math.random() * 10000000, // 0-10M
    apy: Math.random() * 0.5, // 0-50%
    apy_base: Math.random() * 0.3, // 0-30%
    apy_reward: Math.random() * 0.2, // 0-20%
    volume_usd_1d: Math.random() * 1000000, // 0-1M
    exposure: pickRandom(['single', 'multi', 'stable']) as 'single' | 'multi' | 'stable',
    reward_tokens: Math.random() > 0.5 ? [pickRandom(symbols)] : null,
    pool_meta: Math.random() > 0.5 ? { version: 'v3' } : null,
    source: pickRandom(['defillama', 'pendle']) as 'defillama' | 'pendle',
    raw_data: { generated: true, timestamp: Date.now() },
    ...overrides,
  };
};

/**
 * Create a batch of random pool data for testing
 */
export const generateRandomPoolDataBatch = (
  count: number,
  overrides: Partial<PoolData> = {}
): PoolData[] => {
  return Array.from({ length: count }, () => generateRandomPoolData(overrides));
};

/**
 * Mock database connection for testing
 */
export const createMockDatabase = (): MockDatabase => {
  const mockQuery = vi.fn();
  const mockEnd = vi.fn();

  const mockClient = {
    query: mockQuery,
    end: mockEnd,
  };

  return {
    client: mockClient,
    mockQuery: mockQuery as MockedFunction<typeof mockQuery>,
    mockEnd: mockEnd as MockedFunction<typeof mockEnd>,
  };
};

/**
 * Mock HTTP responses for API testing
 */
export const createMockApiResponse = <T>(data: T, status: number = 200) => {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
  };
};

/**
 * Time-based testing utilities
 */
export const mockCurrentTime = (isoString: string): void => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(isoString));
};

export const restoreRealTime = (): void => {
  vi.useRealTimers();
};

/**
 * Deep clone utility for test data isolation
 */
export const deepClone = <T>(obj: T): T => {
  return JSON.parse(JSON.stringify(obj));
};

/**
 * Validate that a PoolAprSnapshotInsert has required fields
 */
export const validatePoolInsert = (insert: PoolAprSnapshotInsert): boolean => {
  return !!(
    insert.chain &&
    insert.protocol &&
    insert.symbol &&
    insert.source &&
    typeof insert.apr === 'number' &&
    insert.snapshot_time
  );
};

/**
 * Create a mock logger that captures log calls for testing
 */
export const createMockLogger = () => {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
};

/**
 * Assert that a function throws with specific error message
 */
export const expectToThrowWithMessage = async (
  fn: () => Promise<unknown> | unknown,
  expectedMessage: string | RegExp
): Promise<void> => {
  try {
    await fn();
    throw new Error('Expected function to throw, but it did not');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (typeof expectedMessage === 'string') {
      if (!message.includes(expectedMessage)) {
        throw new Error(
          `Expected error message to contain "${expectedMessage}", but got: "${message}"`
        );
      }
    } else {
      if (!expectedMessage.test(message)) {
        throw new Error(
          `Expected error message to match ${expectedMessage}, but got: "${message}"`
        );
      }
    }
  }
};

/**
 * Performance testing helper
 */
export const measureExecutionTime = async <T>(
  fn: () => Promise<T> | T
): Promise<{ result: T; durationMs: number }> => {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  return {
    result,
    durationMs: end - start,
  };
};

/**
 * Type-safe test data builder pattern
 */
export class PoolDataBuilder {
  private data: Partial<PoolData> = {};

  withChain(chain: string): this {
    this.data.chain = chain;
    return this;
  }

  withProtocol(protocol: string): this {
    this.data.protocol = protocol;
    return this;
  }

  withSymbol(symbol: string): this {
    this.data.symbol = symbol;
    return this;
  }

  withApy(apy: number): this {
    this.data.apy = apy;
    return this;
  }

  withTvl(tvl: number): this {
    this.data.tvl_usd = tvl;
    return this;
  }

  withSource(source: string): this {
    this.data.source = source;
    return this;
  }

  withUnderlyingTokens(tokens: string[]): this {
    this.data.underlying_tokens = tokens;
    return this;
  }

  build(): PoolData {
    // Ensure required fields have defaults
    const defaults: PoolData = {
      chain: 'ethereum',
      protocol: 'test-protocol',
      symbol: 'TEST-TOKEN',
      apy: 0.05,
      source: 'test',
    };

    return { ...defaults, ...this.data };
  }
}

/**
 * Factory for creating test builders
 */
export const createPoolDataBuilder = (): PoolDataBuilder => new PoolDataBuilder();
