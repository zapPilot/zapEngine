import { vi } from 'vitest';

/**
 * Shared mock factories for test files.
 * Use as: vi.mock('../../src/utils/logger.js', async () => {
 *   const { mockLogger } = await import('../setup/mocks.js');
 *   return mockLogger();
 * })
 */

export function mockLogger() {
  return {
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
}

export function mockEnv(overrides?: Record<string, unknown>) {
  return {
    env: {
      DB_SCHEMA: 'public',
      NODE_ENV: 'test',
      ALPHA_ETL_DATABASE_URL: 'mock',
      ...overrides,
    },
  };
}
