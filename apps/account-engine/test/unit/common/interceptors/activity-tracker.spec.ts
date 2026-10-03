import { ActivityTracker } from '../../../../src/common/interceptors/activity-tracker.interceptor';

function createDatabaseService() {
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });

  return {
    service: {
      getClient: () => ({ from }),
    },
    from,
    update,
    eq,
  };
}

async function flushSetImmediate() {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('ActivityTracker', () => {
  it('updates last_activity_at when a valid userId is provided', async () => {
    const database = createDatabaseService();
    const tracker = new ActivityTracker(database.service as never);

    tracker.trackUserId('user-1');

    await flushSetImmediate();

    expect(database.from).toHaveBeenCalledWith('users');
    expect(database.update).toHaveBeenCalledWith({
      last_activity_at: expect.any(String),
    });
    expect(database.eq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('debounces repeated updates for the same user', async () => {
    const database = createDatabaseService();
    const tracker = new ActivityTracker(database.service as never);

    tracker.trackUserId('user-1');
    tracker.trackUserId('user-1');

    await flushSetImmediate();

    expect(database.from).toHaveBeenCalledTimes(1);
  });

  it('does nothing when userId is missing (undefined)', async () => {
    const database = createDatabaseService();
    const tracker = new ActivityTracker(database.service as never);

    tracker.trackUserId(undefined);

    await flushSetImmediate();

    expect(database.from).not.toHaveBeenCalled();
  });

  it('ignores whitespace-only userId (normalizeUserId returns null)', async () => {
    const database = createDatabaseService();
    const tracker = new ActivityTracker(database.service as never);

    tracker.trackUserId('   ');

    await flushSetImmediate();

    expect(database.from).not.toHaveBeenCalled();
  });

  it('ignores non-string userId values', async () => {
    const database = createDatabaseService();
    const tracker = new ActivityTracker(database.service as never);

    tracker.trackUserId(42);
    tracker.trackUserId(null);
    tracker.trackUserId({});

    await flushSetImmediate();

    expect(database.from).not.toHaveBeenCalled();
  });

  it('reverts cache and logs warning when database update fails', async () => {
    const database = createDatabaseService();
    database.eq.mockResolvedValue({ error: new Error('DB failure') });
    const tracker = new ActivityTracker(database.service as never);

    tracker.trackUserId('user-fail');

    await flushSetImmediate();

    // After a failure the cache entry is removed, so the next request is not debounced
    tracker.trackUserId('user-fail');
    await flushSetImmediate();

    expect(database.from).toHaveBeenCalledTimes(2);
  });

  it('cleanupCache removes stale entries', () => {
    const database = createDatabaseService();
    const tracker = new ActivityTracker(database.service as never);

    const twoHoursAgo = Date.now() - 2.5 * 60 * 60 * 1000;
    const cache = (tracker as unknown as { activityCache: Map<string, number> })
      .activityCache;
    cache.set('stale-user', twoHoursAgo);
    cache.set('fresh-user', Date.now());

    tracker.cleanupCache();

    expect(cache.has('stale-user')).toBe(false);
    expect(cache.has('fresh-user')).toBe(true);
  });
});

/**
 * Regression gate for the Hono middleware param-scoping bug.
 *
 * The middleware must be mounted on a pattern that declares `:userId`
 * (e.g. `/:userId` or `/:userId/*`), otherwise `c.req.param('userId')`
 * resolves to undefined and activity tracking silently no-ops for every
 * request. The original unit tests injected fake `params` objects
 * directly, bypassing Hono entirely, so this was not caught.
 */
