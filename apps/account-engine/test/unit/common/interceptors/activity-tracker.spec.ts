import { ActivityTracker } from '../../../../src/common/interceptors/activity-tracker.interceptor';

function createDatabaseService() {
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });

  return {
    service: {
      getServiceRoleClient: () => ({ from }),
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
  it('updates last_activity_at when userId is present in params', async () => {
    const database = createDatabaseService();
    const tracker = new ActivityTracker(database.service as never);

    tracker.trackRequest({
      params: { userId: 'user-1' },
    });

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

    tracker.trackRequest({ params: { userId: 'user-1' } });
    tracker.trackRequest({ params: { userId: 'user-1' } });

    await flushSetImmediate();

    expect(database.from).toHaveBeenCalledTimes(1);
  });

  it('falls back to query.userId when params.userId is absent', async () => {
    const database = createDatabaseService();
    const tracker = new ActivityTracker(database.service as never);

    tracker.trackRequest({
      params: {},
      query: { userId: 'user-q' },
    });

    await flushSetImmediate();

    expect(database.eq).toHaveBeenCalledWith('id', 'user-q');
  });

  it('does nothing when both params and query userId are absent', async () => {
    const database = createDatabaseService();
    const tracker = new ActivityTracker(database.service as never);

    tracker.trackRequest({ params: {}, query: {} });

    await flushSetImmediate();

    expect(database.from).not.toHaveBeenCalled();
  });

  it('ignores empty string userId (normalizeUserId returns null)', async () => {
    const database = createDatabaseService();
    const tracker = new ActivityTracker(database.service as never);

    tracker.trackRequest({ params: { userId: '   ' }, query: {} });

    await flushSetImmediate();

    expect(database.from).not.toHaveBeenCalled();
  });

  it('reverts cache and logs warning when database update fails', async () => {
    const database = createDatabaseService();
    database.eq.mockResolvedValue({ error: new Error('DB failure') });
    const tracker = new ActivityTracker(database.service as never);

    tracker.trackRequest({ params: { userId: 'user-fail' } });

    await flushSetImmediate();

    // After a failure the cache entry is removed, so the next request is not debounced
    tracker.trackRequest({ params: { userId: 'user-fail' } });
    await flushSetImmediate();

    expect(database.from).toHaveBeenCalledTimes(2);
  });

  it('cleanupCache removes stale entries', () => {
    const database = createDatabaseService();
    const tracker = new ActivityTracker(database.service as never);

    // Manually seed the cache with a stale entry
    const twoHoursAgo = Date.now() - 2.5 * 60 * 60 * 1000;
    // Access private map via type cast
    const cache = (tracker as unknown as { activityCache: Map<string, number> })
      .activityCache;
    cache.set('stale-user', twoHoursAgo);
    cache.set('fresh-user', Date.now());

    tracker.cleanupCache();

    expect(cache.has('stale-user')).toBe(false);
    expect(cache.has('fresh-user')).toBe(true);
  });
});
