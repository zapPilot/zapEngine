import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDbClient } from '../../../../src/config/database.js';
import { BaseDatabaseClient } from '../../../../src/core/database/baseDatabaseClient.js';
import { replaceRowsInTransaction } from '../../../../src/modules/wallet/dailyReplacement.js';

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    query: vi.fn(),
    release: vi.fn(),
  },
}));

vi.mock('../../../../src/config/database.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/config/database.js')>();
  return {
    ...actual,
    getDbClient: vi.fn().mockResolvedValue(mockClient),
  };
});

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

class DailyReplacementTestClient extends BaseDatabaseClient {
  async replace(rows: number[]): Promise<number> {
    return this.withDatabaseClient((client) =>
      replaceRowsInTransaction({
        client,
        table: 'analytics.daily_test_rows',
        deleteSql: 'DELETE FROM analytics.daily_test_rows WHERE wallet = $1',
        deleteValues: ['0xabc'],
        rows,
        batchSize: 2,
        buildInsertValues: (batch) => ({
          columns: ['value'],
          placeholders: batch
            .map((_, index) => `($${index + 1})`)
            .join(', '),
          values: batch,
        }),
      }),
    );
  }
}

describe('replaceRowsInTransaction transaction boundary', () => {
  beforeEach(() => {
    mockClient.query.mockReset();
    mockClient.release.mockReset();
    (getDbClient as unknown).mockClear();
    (getDbClient as unknown).mockResolvedValue(mockClient);
  });

  it('rolls back the whole replacement when a later insert batch fails', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce(undefined) // DELETE
      .mockResolvedValueOnce({ rowCount: 2 }) // first INSERT batch
      .mockRejectedValueOnce(new Error('second batch failed'))
      .mockResolvedValueOnce(undefined); // ROLLBACK from BaseDatabaseClient

    const client = new DailyReplacementTestClient();

    await expect(client.replace([1, 2, 3])).rejects.toThrow(
      'second batch failed',
    );

    expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(mockClient.query).toHaveBeenNthCalledWith(
      2,
      'DELETE FROM analytics.daily_test_rows WHERE wallet = $1',
      ['0xabc'],
    );
    expect(mockClient.query.mock.calls[2]?.[0]).toContain(
      'INSERT INTO analytics.daily_test_rows',
    );
    expect(mockClient.query.mock.calls[3]?.[0]).toContain(
      'INSERT INTO analytics.daily_test_rows',
    );
    expect(mockClient.query).toHaveBeenNthCalledWith(5, 'ROLLBACK');
    expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});
