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

class NullRowCountClient extends BaseDatabaseClient {
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
          placeholders: batch.map((_, index) => `($${index + 1})`).join(', '),
          values: batch,
        }),
      }),
    );
  }
}

describe('dailyReplacement coverage', () => {
  beforeEach(() => {
    mockClient.query.mockReset();
    mockClient.release.mockReset();
    (getDbClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockClient,
    );
  });

  it('treats a null insert row count as zero inserts', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce(undefined) // DELETE
      .mockResolvedValueOnce({ rowCount: null }) // INSERT batch
      .mockResolvedValueOnce(undefined); // COMMIT

    const inserted = await new NullRowCountClient().replace([1, 2]);

    expect(inserted).toBe(0);
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
  });
});
