import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SentimentWriter } from '../../../../src/modules/sentiment/index.js';
import type { SentimentSnapshotInsert } from '../../../../src/types/database.js';

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    query: vi.fn(),
    release: vi.fn(),
  },
}));

// Mocks
vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

vi.mock('../../../../src/config/environment.js', () => ({
  env: {
    DB_SCHEMA: 'public',
  },
}));

vi.mock('../../../../src/config/database.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/config/database.js')>();
  return {
    ...actual,
    getDbClient: vi.fn().mockResolvedValue(mockClient),
    closeDbPool: vi.fn(),
  };
});

describe('SentimentWriter', () => {
  let writer: SentimentWriter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.query.mockReset();
    mockClient.release.mockReset();
    writer = new SentimentWriter();
  });

  const makeSnapshot = (overrides: Partial<SentimentSnapshotInsert> = {}): SentimentSnapshotInsert => ({
    sentiment_value: 50,
    classification: 'Neutral',
    source: 'coinmarketcap',
    snapshot_time: new Date('2024-01-01T00:00:00Z').toISOString(),
    raw_data: { sample: true },
    ...overrides,
  });

  it('returns success when no snapshots are provided', async () => {
    const result = await writer.writeSentimentSnapshots([], 'feargreed');

    expect(result).toEqual({
      success: true,
      recordsInserted: 0,
      errors: [],
      duplicatesSkipped: 0
    });
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it('writes valid snapshots and aggregates inserted/duplicate counts', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }], rowCount: 2 });

    const snapshots = [makeSnapshot(), makeSnapshot({ sentiment_value: 42 })];
    const result = await writer.writeSentimentSnapshots(snapshots, 'feargreed');

    expect(result.success).toBe(true);
    expect(result.recordsInserted).toBe(2);
    expect(result.duplicatesSkipped).toBe(0);
    expect(mockClient.query).toHaveBeenCalledTimes(1);
  });

  it('skips invalid records and reports errors', async () => {
    const invalid = makeSnapshot({ classification: '' });
    const result = await writer.writeSentimentSnapshots([invalid], 'feargreed');

    expect(result.success).toBe(true);
    expect(result.recordsInserted).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it('tracks duplicates when upsert returns fewer rows than sent', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 });

    const snapshots = [makeSnapshot(), makeSnapshot({ sentiment_value: 42 })];
    const result = await writer.writeSentimentSnapshots(snapshots, 'feargreed');

    expect(result.success).toBe(true);
    expect(result.recordsInserted).toBe(1);
    expect(result.duplicatesSkipped).toBe(1);
  });

  it('returns failure result when batch throws unexpectedly', async () => {
    vi.spyOn(writer as unknown, 'writeBatch').mockRejectedValueOnce(new Error('boom'));

    const result = await writer.writeSentimentSnapshots([makeSnapshot()], 'feargreed');

    expect(result.success).toBe(false);
    expect(result.errors).toContain('boom');
  });

  it('wraps database errors from writeBatch', async () => {
    mockClient.query.mockRejectedValueOnce(new Error('db down'));

    const result = await writer.writeSentimentSnapshots([makeSnapshot()], 'feargreed');

    expect(result.success).toBe(false);
    expect(result.errors).toContain('db down');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('returns default batch result when writeBatch receives empty array', async () => {
    const result = await (writer as unknown).writeBatch([], 1);

    expect(result).toEqual({
      success: true,
      recordsInserted: 0,
      errors: [],
      duplicatesSkipped: 0,
    });
  });

  it('returns failure when writeBatch rejects with non-Error', async () => {
    vi.spyOn(writer as unknown, 'writeBatch').mockRejectedValueOnce('string failure');

    const result = await writer.writeSentimentSnapshots([makeSnapshot()], 'feargreed');

    expect(result.success).toBe(false);
    expect(result.errors).toContain('Unknown error');
  });

  it('captures non-Error failures inside writeBatch catch', async () => {
    mockClient.query.mockRejectedValueOnce('weird failure');

    const result = await writer.writeSentimentSnapshots([makeSnapshot()], 'feargreed');

    expect(result.success).toBe(false);
    expect(result.errors).toContain('Unknown database error');
  });

  it('allows different sources for same timestamp (multi-source coexistence)', async () => {
    // This test verifies that the unique constraint (source, snapshot_time) allows
    // both historical alternative.me data and new coinmarketcap data to coexist
    const timestamp = new Date('2024-01-15T10:00:00.000Z').toISOString();

    const snapshots = [
      {
        sentiment_value: 50,
        classification: 'Neutral',
        source: 'alternative.me',  // Historical source
        snapshot_time: timestamp,
        raw_data: { legacy: true }
      },
      {
        sentiment_value: 52,
        classification: 'Neutral',
        source: 'coinmarketcap',  // New source
        snapshot_time: timestamp,  // Same timestamp
        raw_data: { migrated: true }
      }
    ];

    // Mock DB returning both records (no conflict due to different sources)
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }], rowCount: 2 });

    const result = await writer.writeSentimentSnapshots(snapshots as SentimentSnapshotInsert[], 'mixed');

    expect(result.success).toBe(true);
    expect(result.recordsInserted).toBe(2);  // Both should be inserted
    expect(result.duplicatesSkipped).toBe(0);
    expect(result.errors).toEqual([]);
  });

  describe('null/undefined rowCount handling', () => {
    it('should handle null rowCount from query result', async () => {
      mockClient.query.mockResolvedValueOnce({ rowCount: null, rows: [{ id: 1 }] });

      const result = await writer.writeSentimentSnapshots([makeSnapshot()], 'feargreed');

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(0);
    });

    it('should handle undefined rowCount and empty rows', async () => {
      mockClient.query.mockResolvedValueOnce({ rowCount: undefined, rows: [] });

      const result = await writer.writeSentimentSnapshots([makeSnapshot()], 'feargreed');

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(0);
    });

    it('should handle undefined rowCount and undefined rows', async () => {
      mockClient.query.mockResolvedValueOnce({ rowCount: undefined });

      const result = await writer.writeSentimentSnapshots([makeSnapshot()], 'feargreed');

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(0);
    });
  });

  describe('Duplicate Handling Edge Cases', () => {
    it('handles duplicate snapshot_time upsert correctly (same source + timestamp)', async () => {
      const timestamp = new Date('2024-01-15T12:00:00.000Z').toISOString();

      const snapshot = makeSnapshot({
        source: 'coinmarketcap',
        snapshot_time: timestamp,
        sentiment_value: 65,
        classification: 'Greed'
      });

      // First call: insert succeeds
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 });

      const firstResult = await writer.writeSentimentSnapshots([snapshot], 'feargreed');

      expect(firstResult.success).toBe(true);
      expect(firstResult.recordsInserted).toBe(1);
      expect(firstResult.duplicatesSkipped).toBe(0);

      // Second call: same source + timestamp, upsert updates existing record
      // Mock DB returning 0 new rows (update only, no insert)
      mockClient.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const duplicateSnapshot = makeSnapshot({
        source: 'coinmarketcap',
        snapshot_time: timestamp,
        sentiment_value: 67,  // Slightly different value
        classification: 'Greed'
      });

      const secondResult = await writer.writeSentimentSnapshots([duplicateSnapshot], 'feargreed');

      expect(secondResult.success).toBe(true);
      expect(secondResult.recordsInserted).toBe(0);  // No new insert
      expect(secondResult.duplicatesSkipped).toBe(1);  // Tracked as duplicate
    });
  });
});
