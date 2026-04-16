import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseDatabaseClient } from '../../../../src/core/database/baseDatabaseClient.js';
import { DatabaseError } from '../../../../src/utils/errors.js';
import { getDbClient } from '../../../../src/config/database.js';

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    query: vi.fn(),
    release: vi.fn()
  }
}));

vi.mock('../../../../src/config/database.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/config/database.js')>();
  return {
    ...actual,
    getDbClient: vi.fn().mockResolvedValue(mockClient)
  };
});

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

class TestClient extends BaseDatabaseClient {
  async run<T>(operation: (client: unknown) => Promise<T>): Promise<T> {
    return this.withDatabaseClient(operation);
  }
}

describe('BaseDatabaseClient', () => {
  let client: TestClient;

  beforeEach(() => {
    mockClient.query.mockReset();
    mockClient.release.mockReset();
    (getDbClient as unknown).mockClear();
    (getDbClient as unknown).mockResolvedValue(mockClient);
    client = new TestClient();
  });

  it('acquires and releases client on success', async () => {
    mockClient.query.mockResolvedValueOnce('ok');

    const result = await client.run(async (db) => db.query('SELECT 1'));

    expect(result).toBe('ok');
    expect(mockClient.query).toHaveBeenCalledWith('SELECT 1');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('wraps errors in DatabaseError and still releases client', async () => {
    mockClient.query.mockRejectedValueOnce(new Error('fail'));

    await expect(client.run(async (db) => db.query('BAD'))).rejects.toBeInstanceOf(DatabaseError);
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('issues ROLLBACK on operation failure', async () => {
    // First query call is the operation itself (fails), second is ROLLBACK
    mockClient.query
      .mockRejectedValueOnce(new Error('operation error'))
      .mockResolvedValueOnce(undefined); // ROLLBACK succeeds

    await expect(client.run(async (db) => db.query('INSERT ...'))).rejects.toBeInstanceOf(DatabaseError);
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('handles rollback failure gracefully', async () => {
    // Both the operation and the ROLLBACK fail
    mockClient.query
      .mockRejectedValueOnce(new Error('operation error'))
      .mockRejectedValueOnce(new Error('rollback error'));

    await expect(client.run(async (db) => db.query('INSERT ...'))).rejects.toBeInstanceOf(DatabaseError);
    // Client should still be released despite rollback failure
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('wraps non-Error thrown values in DatabaseError with generic message', async () => {
    await expect(
      client.run(async () => { throw 'string error'; })
    ).rejects.toThrow('Unknown database error');
    expect(mockClient.release).toHaveBeenCalled();
  });
});
