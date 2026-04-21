import { Hono } from 'hono';

import {
  ActivityTracker,
  createActivityTrackingMiddleware,
} from '../../../../src/common/interceptors/activity-tracker.interceptor';

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
describe('createActivityTrackingMiddleware (Hono integration)', () => {
  const UUID_A = '123e4567-e89b-12d3-a456-426614174000';
  const UUID_B = '00000000-0000-0000-0000-000000000001';
  const UUID_PATTERN = '[0-9a-fA-F-]{36}';

  function buildApp() {
    const database = createDatabaseService();
    const tracker = new ActivityTracker(database.service as never);
    const users = new Hono();
    const mw = createActivityTrackingMiddleware(tracker);
    users.use(`/:userId{${UUID_PATTERN}}`, mw);
    users.use(`/:userId{${UUID_PATTERN}}/*`, mw);
    users.post('/connect-wallet', (c) => c.json({ ok: 'connect' }));
    users.get('/:userId', (c) => c.json({ ok: 'profile' }));
    users.get('/:userId/wallets', (c) => c.json({ ok: 'wallets' }));
    const app = new Hono();
    app.route('/users', users);
    return { app, database };
  }

  it('extracts userId from path params and tracks activity', async () => {
    const { app, database } = buildApp();

    const response = await app.request(`http://localhost/users/${UUID_A}`);
    await flushSetImmediate();

    expect(response.status).toBe(200);
    expect(database.eq).toHaveBeenCalledWith('id', UUID_A);
  });

  it('tracks activity on nested routes like /:userId/wallets', async () => {
    const { app, database } = buildApp();

    const response = await app.request(
      `http://localhost/users/${UUID_B}/wallets`,
    );
    await flushSetImmediate();

    expect(response.status).toBe(200);
    expect(database.eq).toHaveBeenCalledWith('id', UUID_B);
  });

  it('falls back to query.userId when param is absent', async () => {
    const database = createDatabaseService();
    const tracker = new ActivityTracker(database.service as never);
    const app = new Hono();
    app.use('*', createActivityTrackingMiddleware(tracker));
    app.get('/fallback', (c) => c.json({ ok: true }));

    const response = await app.request(
      `http://localhost/fallback?userId=${UUID_A}`,
    );
    await flushSetImmediate();

    expect(response.status).toBe(200);
    expect(database.eq).toHaveBeenCalledWith('id', UUID_A);
  });

  it('does not track /connect-wallet — UUID regex excludes non-UUID segments', async () => {
    const { app, database } = buildApp();

    const response = await app.request(
      'http://localhost/users/connect-wallet',
      { method: 'POST' },
    );
    await flushSetImmediate();

    expect(response.status).toBe(200);
    expect(database.from).not.toHaveBeenCalled();
  });
});
