/**
 * Test utility functions and helpers
 * Provides common testing utilities for mocking, assertions, and data generation
 */

import { vi, type MockedFunction } from 'vitest';

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
  tolerance: number = 0.00001,
): void => {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(
      `Expected ${actual} to be within ${tolerance} of ${expected}, but difference was ${diff}`,
    );
  }
};

/**
 * Assert that two arrays contain the same elements (order independent)
 */
export const expectArraysToContainSameElements = <T>(
  actual: T[],
  expected: T[],
): void => {
  if (actual.length !== expected.length) {
    throw new Error(
      `Expected arrays to have same length. Actual: ${actual.length}, Expected: ${expected.length}`,
    );
  }

  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();

  for (let i = 0; i < sortedActual.length; i++) {
    if (sortedActual[i] !== sortedExpected[i]) {
      throw new Error(
        `Arrays differ at index ${i}. Actual: ${sortedActual[i]}, Expected: ${sortedExpected[i]}`,
      );
    }
  }
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
  expectedMessage: string | RegExp,
): Promise<void> => {
  try {
    await fn();
    throw new Error('Expected function to throw, but it did not');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (typeof expectedMessage === 'string') {
      if (!message.includes(expectedMessage)) {
        throw new Error(
          `Expected error message to contain "${expectedMessage}", but got: "${message}"`,
        );
      }
    } else {
      if (!expectedMessage.test(message)) {
        throw new Error(
          `Expected error message to match ${expectedMessage}, but got: "${message}"`,
        );
      }
    }
  }
};

/**
 * Performance testing helper
 */
export const measureExecutionTime = async <T>(
  fn: () => Promise<T> | T,
): Promise<{ result: T; durationMs: number }> => {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  return {
    result,
    durationMs: end - start,
  };
};
