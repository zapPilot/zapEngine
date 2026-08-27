import { describe, it, expect, vi } from 'vitest';

describe('database configuration behaviors', () => {
  it('enables SSL when running in production', async () => {
    vi.resetModules();
    const PoolMock = vi.fn(function Pool() {
      return { on: vi.fn(), connect: vi.fn(), end: vi.fn() };
    });

    vi.doMock('pg', () => ({ Pool: PoolMock }));
    vi.doMock('../../../src/config/environment.js', () => ({
      env: {
        ALPHA_ETL_DATABASE_URL: 'postgres://test',
        NODE_ENV: 'production',
        DB_SCHEMA: 'public',
      },
    }));

    const db = await import('../../../src/config/database.js');
    db.createDbPool();

    expect(PoolMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ssl: { rejectUnauthorized: false },
      }),
    );

    vi.resetModules();
  });

  it('returns false when initial database check fails', async () => {
    vi.resetModules();
    const client = { query: vi.fn(), release: vi.fn() };
    vi.doMock('pg', () => ({
      Pool: vi.fn(function Pool() {
        return {
          on: vi.fn(),
          connect: vi.fn().mockResolvedValue(client),
          end: vi.fn(),
        };
      }),
    }));
    vi.doMock('../../../src/config/environment.js', () => ({
      env: {
        ALPHA_ETL_DATABASE_URL: 'postgres://test',
        NODE_ENV: 'test',
        DB_SCHEMA: 'public',
      },
    }));

    const db = await import('../../../src/config/database.js');
    client.query.mockRejectedValueOnce(new Error('query broke'));

    const ok = await db.testDatabaseConnection();
    expect(ok).toBe(false);

    vi.resetModules();
  });

  it('returns false when pingDatabase fails to connect', async () => {
    vi.resetModules();
    const client = { query: vi.fn(), release: vi.fn() };
    vi.doMock('pg', () => ({
      Pool: vi.fn(function Pool() {
        return {
          on: vi.fn(),
          connect: vi.fn().mockResolvedValue(client),
          end: vi.fn(),
        };
      }),
    }));
    vi.doMock('../../../src/config/environment.js', () => ({
      env: {
        ALPHA_ETL_DATABASE_URL: 'postgres://test',
        NODE_ENV: 'test',
        DB_SCHEMA: 'public',
      },
    }));

    const db = await import('../../../src/config/database.js');
    client.query.mockRejectedValueOnce(new Error('ping fail'));

    const ok = await db.pingDatabase();
    expect(ok).toBe(false);

    vi.resetModules();
  });

  it('captures only the first of three consecutive pingDatabase failures', async () => {
    vi.resetModules();
    const client = { query: vi.fn(), release: vi.fn() };
    vi.doMock('pg', () => ({
      Pool: vi.fn(function Pool() {
        return {
          on: vi.fn(),
          connect: vi.fn().mockResolvedValue(client),
          end: vi.fn(),
        };
      }),
    }));
    vi.doMock('../../../src/config/environment.js', () => ({
      env: {
        ALPHA_ETL_DATABASE_URL: 'postgres://test',
        NODE_ENV: 'test',
        DB_SCHEMA: 'public',
      },
    }));
    const captureBackgroundException = vi.fn();
    vi.doMock('../../../src/observability/sentry.js', () => ({
      captureBackgroundException,
    }));

    const db = await import('../../../src/config/database.js');
    client.query.mockRejectedValue(new Error('ping fail'));

    await db.pingDatabase();
    await db.pingDatabase();
    await db.pingDatabase();

    expect(captureBackgroundException).toHaveBeenCalledTimes(1);
    expect(captureBackgroundException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ component: 'db-health', level: 'warning' }),
    );

    vi.resetModules();
  });

  it('resets the pingDatabase failure counter after a success, so the next failure captures again', async () => {
    vi.resetModules();
    const client = { query: vi.fn(), release: vi.fn() };
    vi.doMock('pg', () => ({
      Pool: vi.fn(function Pool() {
        return {
          on: vi.fn(),
          connect: vi.fn().mockResolvedValue(client),
          end: vi.fn(),
        };
      }),
    }));
    vi.doMock('../../../src/config/environment.js', () => ({
      env: {
        ALPHA_ETL_DATABASE_URL: 'postgres://test',
        NODE_ENV: 'test',
        DB_SCHEMA: 'public',
      },
    }));
    const captureBackgroundException = vi.fn();
    vi.doMock('../../../src/observability/sentry.js', () => ({
      captureBackgroundException,
    }));

    const db = await import('../../../src/config/database.js');

    client.query.mockRejectedValueOnce(new Error('first run failure'));
    await db.pingDatabase();
    expect(captureBackgroundException).toHaveBeenCalledTimes(1);

    client.query.mockResolvedValueOnce({ rows: [] });
    await db.pingDatabase();

    client.query.mockRejectedValueOnce(new Error('second run failure'));
    await db.pingDatabase();

    expect(captureBackgroundException).toHaveBeenCalledTimes(2);

    vi.resetModules();
  });
});
