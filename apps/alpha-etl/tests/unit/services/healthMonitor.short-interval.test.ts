import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as database from '../../../src/config/database.js';
import { startDatabaseHealthMonitor } from '../../../src/modules/core/healthMonitor.js';
import {
  getHealthState,
  setHealthState,
} from '../../../src/modules/core/healthStatus.js';

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

describe('database health monitor short intervals', () => {
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

  it('runs exactly one additional health check when a 100ms interval elapses', async () => {
    const pingDatabaseSpy = vi
      .spyOn(database, 'pingDatabase')
      .mockResolvedValue(true);

    startDatabaseHealthMonitor(100);
    await vi.runAllTicks();

    expect(pingDatabaseSpy).toHaveBeenCalledTimes(1);
    expect(getHealthState().status).toBe('healthy');

    await vi.advanceTimersByTimeAsync(99);
    expect(pingDatabaseSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(pingDatabaseSpy).toHaveBeenCalledTimes(2);
    expect(getHealthState().status).toBe('healthy');
  });
});
