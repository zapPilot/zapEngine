import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MacroFearGreedWriter } from '../../../../src/modules/macro-fear-greed/writer.js';
import type { MacroFearGreedSnapshotInsert } from '../../../../src/types/database.js';

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

vi.mock('../../../../src/config/database.js', () => ({
  getTableName: vi
    .fn()
    .mockImplementation((table: string) => `alpha_raw.${table.toLowerCase()}`),
}));

type MockClient = {
  query: ReturnType<typeof vi.fn>;
};

type WriterWithDatabaseClient = {
  withDatabaseClient: <T>(fn: (client: MockClient) => Promise<T>) => Promise<T>;
};

function createSnapshot(
  overrides: Partial<MacroFearGreedSnapshotInsert> = {},
): MacroFearGreedSnapshotInsert {
  return {
    snapshot_date: '2026-04-29',
    score: 72,
    label: 'greed',
    source: 'cnn_fear_greed_unofficial',
    provider_updated_at: '2026-04-29T00:00:00.000Z',
    raw_rating: 'Greed',
    raw_data: { score: 72 },
    ...overrides,
  };
}

describe('MacroFearGreedWriter', () => {
  let writer: MacroFearGreedWriter;
  let mockClient: MockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    writer = new MacroFearGreedWriter();
    mockClient = { query: vi.fn() };
    vi.spyOn(
      writer as unknown as WriterWithDatabaseClient,
      'withDatabaseClient',
    ).mockImplementation(async (fn) => fn(mockClient));
  });

  it('returns an empty write result for empty input', async () => {
    const result = await writer.writeSnapshots([]);

    expect(result).toEqual({
      success: true,
      recordsInserted: 0,
      errors: [],
      duplicatesSkipped: 0,
    });
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it('skips invalid records before writing a batch', async () => {
    const result = await writer.writeSnapshots([
      createSnapshot({ source: '' }),
      createSnapshot({ label: '' }),
    ]);

    expect(result).toMatchObject({
      success: true,
      recordsInserted: 0,
      duplicatesSkipped: 2,
    });
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it('upserts valid macro snapshots', async () => {
    mockClient.query.mockResolvedValue({ rowCount: 1, rows: [{ id: 123 }] });

    const result = await writer.writeSnapshots([createSnapshot()]);

    expect(result).toMatchObject({
      success: true,
      recordsInserted: 1,
      duplicatesSkipped: 0,
    });
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'INSERT INTO alpha_raw.macro_fear_greed_snapshots',
      ),
      [
        '2026-04-29',
        72,
        'greed',
        'cnn_fear_greed_unofficial',
        '2026-04-29T00:00:00.000Z',
        'Greed',
        JSON.stringify({ score: 72 }),
      ],
    );
  });

  it('returns write errors when the upsert fails', async () => {
    mockClient.query.mockRejectedValue(new Error('write failed'));

    const result = await writer.writeSnapshots([createSnapshot()]);

    expect(result.success).toBe(false);
    expect(result.errors).toEqual(['write failed']);
  });

  it('returns null when no latest snapshot exists', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    const result = await writer.getLatestSnapshot(3600);

    expect(result).toBeNull();
    expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), [
      '3600 seconds',
    ]);
  });

  it('maps the latest snapshot row into macro data', async () => {
    mockClient.query.mockResolvedValue({
      rows: [
        {
          score: '42.50',
          label: 'fear',
          source: 'cnn_fear_greed_unofficial',
          provider_updated_at: new Date('2026-04-29T00:00:00.000Z'),
          raw_rating: null,
          raw_data: null,
        },
      ],
    });

    const result = await writer.getLatestSnapshot();

    expect(result).toEqual({
      score: 42.5,
      label: 'fear',
      source: 'cnn_fear_greed_unofficial',
      updatedAt: '2026-04-29T00:00:00.000Z',
      rawRating: null,
      rawData: {},
    });
    expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), [null]);
  });
});
