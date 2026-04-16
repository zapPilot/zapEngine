import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';

const poolEmitter = new EventEmitter() as unknown;
poolEmitter.end = vi.fn();
poolEmitter.connect = vi.fn();

vi.mock('pg', () => ({
  Pool: vi.fn(function Pool() {
    return poolEmitter;
  })
}));

const mockLogger = {
  info: vi.fn(),
  error: vi.fn()
};

vi.mock('../../../src/utils/logger.js', () => ({
  logger: mockLogger
}));

vi.mock('../../../src/config/environment.js', () => ({
  env: {
    DATABASE_URL: 'postgres://user:pass@localhost:5432/test',
    NODE_ENV: 'test'
  }
}));

describe('database pool idle error handling', () => {
  it('logs idle client errors from pool', async () => {
    const { createDbPool } = await import('../../../src/config/database.js');

    createDbPool();
    poolEmitter.emit('error', new Error('idle fail'));

    expect(mockLogger.error).toHaveBeenCalledWith('Unexpected error on idle client:', expect.any(Error));
  });
});
