import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as database from '../../../src/config/database.js';
import { startDatabaseHealthMonitor } from '../../../src/modules/core/healthMonitor.js';
import { setHealthState } from '../../../src/modules/core/healthStatus.js';

vi.mock('../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../setup/mocks.js');
  return mockLogger();
});

vi.mock('../../../src/config/database.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../src/config/database.js')>();
  return {
    ...actual,
    pingDatabase: vi.fn(),
  };
});

describe('database health monitor invalid intervals', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setHealthState({ status: 'initializing', lastCheckedAt: null });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([0, -1_000, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid interval %s before pinging or scheduling',
    (intervalMs) => {
      const pingDatabaseSpy = vi
        .spyOn(database, 'pingDatabase')
        .mockResolvedValue(true);
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

      expect(() => startDatabaseHealthMonitor(intervalMs)).toThrow(
        new RangeError('Health check interval must be a positive number'),
      );
      expect(pingDatabaseSpy).not.toHaveBeenCalled();
      expect(setIntervalSpy).not.toHaveBeenCalled();
    },
  );
});
