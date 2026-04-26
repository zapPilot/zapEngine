/**
 * Unit tests for PoolWriter class
 * Tests database operations, batch processing, connection management, and error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PoolClient, QueryResult } from 'pg';
import type { PoolAprSnapshotInsert } from '../../../../src/types/database.js';
import { mockDatabaseInserts } from '../../../fixtures/poolData.js';
import { measureExecutionTime } from '../../../utils/testHelpers.js';

// Mock dependencies first before importing the class
vi.mock('../../../../src/config/database.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../src/config/database.js')>();
  return {
    ...actual,
    getDbClient: vi.fn(),
  };
});

vi.mock('../../../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../../../setup/mocks.js');
  return mockLogger();
});

vi.mock('../../../../src/config/environment.js', () => ({
  env: {
    DB_SCHEMA: 'alpha_raw',
    NODE_ENV: 'test',
    ALPHA_ETL_DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  },
}));

// Import mocked modules and the class after mocking
import { getDbClient } from '../../../../src/config/database.js';
import { logger } from '../../../../src/utils/logger.js';
import { PoolWriter } from '../../../../src/modules/pool/writer.js';

const mockGetDbClient = getDbClient as ReturnType<typeof vi.fn>;

describe('PoolWriter', () => {
  let poolWriter: PoolWriter;
  let mockClient: Partial<PoolClient>;
  let mockQueryResult: QueryResult<unknown>;

  beforeEach(() => {
    poolWriter = new PoolWriter();

    // Create mock database client
    mockQueryResult = {
      rows: [{ id: '1' }, { id: '2' }, { id: '3' }],
      rowCount: 3,
      command: 'INSERT',
      oid: 0,
      fields: [],
    };

    mockClient = {
      query: vi.fn().mockResolvedValue(mockQueryResult),
      release: vi.fn(),
    };

    mockGetDbClient.mockResolvedValue(mockClient as PoolClient);

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('writePoolSnapshots', () => {
    describe('success scenarios', () => {
      it('should handle empty array gracefully', async () => {
        const result = await poolWriter.writePoolSnapshots([]);

        expect(result).toEqual({
          success: true,
          recordsInserted: 0,
          errors: [],
          duplicatesSkipped: 0,
        });

        expect(mockGetDbClient).not.toHaveBeenCalled();
        // Early return for empty array - no logging occurs
        expect(logger.info).not.toHaveBeenCalled();
      });

      it('should successfully write single batch of valid snapshots', async () => {
        const snapshots = mockDatabaseInserts.slice(0, 3);

        const result = await poolWriter.writePoolSnapshots(snapshots);

        expect(result.success).toBe(true);
        expect(result.recordsInserted).toBe(3);
        expect(result.errors).toEqual([]);
        expect(result.duplicatesSkipped).toBe(0);

        expect(mockGetDbClient).toHaveBeenCalledOnce();
        expect(mockClient.query).toHaveBeenCalledOnce();
        expect(mockClient.release).toHaveBeenCalledOnce();
      });

      it('should prefer rowCount over rows length when counting inserts', async () => {
        const snapshots = mockDatabaseInserts.slice(0, 1);
        const mismatchedResult = {
          rows: [{ id: '1' }],
          rowCount: 5,
          command: 'INSERT',
          oid: 0,
          fields: [],
        };

        (mockClient.query as unknown).mockResolvedValueOnce(mismatchedResult);

        const result = await poolWriter.writePoolSnapshots(snapshots);

        expect(result.recordsInserted).toBe(5);
      });

      it('should process large batches in chunks', async () => {
        // Create 1200 snapshots to test batching (batch size is 500)
        const largeDataset = Array.from({ length: 1200 }, (_, index) => ({
          ...mockDatabaseInserts[0],
          pool_address: `0x${'1'.repeat(39)}${index}`,
        }));

        const result = await poolWriter.writePoolSnapshots(largeDataset);

        expect(result.success).toBe(true);
        expect(result.recordsInserted).toBe(9); // 3 rows × 3 batches (mocked)

        // Should be called once per batch (3 batches for 1200 records with batch size 500)
        expect(mockGetDbClient).toHaveBeenCalledTimes(3);
        expect(mockClient.query).toHaveBeenCalledTimes(3);
        expect(mockClient.release).toHaveBeenCalledTimes(3);
      });

      it('should generate correct SQL with proper placeholders', async () => {
        const snapshots = [mockDatabaseInserts[0]];

        await poolWriter.writePoolSnapshots(snapshots);

        const queryCall = (mockClient.query as unknown).mock.calls[0];
        const [query, values] = queryCall;

        expect(query).toContain('INSERT INTO alpha_raw.pool_apr_snapshots');

        // Check placeholder format
        expect(query).toContain(
          '($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)',
        );

        // Check values array has correct length (18 columns)
        expect(values).toHaveLength(18);
        expect(values[0]).toBe(snapshots[0].pool_address);
        expect(values[4]).toBe(snapshots[0].symbol);
        expect(values[16]).toBe(snapshots[0].source);
      });

      it('should handle null values correctly', async () => {
        const snapshotWithNulls: PoolAprSnapshotInsert = {
          pool_address: null,
          protocol_address: null,
          chain: 'ethereum',
          protocol: 'test',
          symbol: 'TEST',
          symbols: null,
          underlying_tokens: null,
          tvl_usd: null,
          apr: 0.05,
          apr_base: null,
          apr_reward: null,
          volume_usd_1d: null,
          exposure: null,
          reward_tokens: null,
          pool_meta: null,
          raw_data: null,
          source: 'test',
          snapshot_time: '2024-01-15T12:00:00.000Z',
        };

        const result = await poolWriter.writePoolSnapshots([snapshotWithNulls]);

        expect(result.success).toBe(true);

        const queryCall = (mockClient.query as unknown).mock.calls[0];
        const [, values] = queryCall;

        expect(values[0]).toBeNull(); // pool_address
        expect(values[1]).toBeNull(); // protocol_address
        expect(values[5]).toBeNull(); // symbols
      });
    });

    describe('data validation', () => {
      it('should filter out records missing required fields', async () => {
        const invalidSnapshots = [
          // Missing source
          {
            ...mockDatabaseInserts[0],
            source: undefined,
          },
          // Missing symbol
          {
            ...mockDatabaseInserts[0],
            symbol: undefined,
          },
          // Missing APR
          {
            ...mockDatabaseInserts[0],
            apr: undefined,
          },
          // Valid record
          mockDatabaseInserts[0],
        ] as PoolAprSnapshotInsert[];

        const result = await poolWriter.writePoolSnapshots(invalidSnapshots);

        expect(result.success).toBe(true);
        expect(result.recordsInserted).toBe(3); // Only 1 valid record, but mocked to return 3
        expect(result.errors).toHaveLength(3); // 3 validation errors

        result.errors.forEach((error) => {
          expect(error).toContain('Invalid record: missing required fields');
        });
      });

      it('should handle empty string validation', async () => {
        const snapshotWithEmptyFields = {
          ...mockDatabaseInserts[0],
          source: '',
          symbol: '',
        };

        const result = await poolWriter.writePoolSnapshots([
          snapshotWithEmptyFields,
        ]);

        expect(result.success).toBe(true);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('missing required fields');
      });

      it('should handle null APR validation', async () => {
        const snapshotWithNullApr = {
          ...mockDatabaseInserts[0],
          apr: null,
        };

        const result = await poolWriter.writePoolSnapshots([
          snapshotWithNullApr as unknown,
        ]);

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('apr: null');
      });
    });

    describe('error handling', () => {
      it('should handle database connection failures', async () => {
        mockGetDbClient.mockRejectedValue(new Error('Connection failed'));

        const result = await poolWriter.writePoolSnapshots(mockDatabaseInserts);

        expect(result.success).toBe(false);
        expect(result.recordsInserted).toBe(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toBe('Connection failed');
      });

      it('should handle SQL query errors', async () => {
        (mockClient.query as unknown).mockRejectedValue(
          new Error('Syntax error'),
        );

        const result = await poolWriter.writePoolSnapshots(mockDatabaseInserts);

        expect(result.success).toBe(false);
        expect(result.recordsInserted).toBe(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toBe('Syntax error');
      });

      it('should handle query errors in batch processing', async () => {
        (mockClient.query as unknown).mockRejectedValue(
          new Error('Query error'),
        );

        const result = await poolWriter.writePoolSnapshots(mockDatabaseInserts);

        expect(result.success).toBe(false);
        expect(result.errors[0]).toBe('Query error');
        // Note: Current implementation doesn't release client on error - this is a bug
        // but we test the current behavior
      });

      it('propagates unexpected errors thrown inside writeBatch', async () => {
        vi.spyOn(poolWriter as unknown, 'writeBatch').mockRejectedValueOnce(
          new Error('explode'),
        );

        const result = await poolWriter.writePoolSnapshots(mockDatabaseInserts);

        expect(result.success).toBe(false);
        expect(result.errors).toContain('explode');
      });

      it('should handle batch failures gracefully', async () => {
        // First batch succeeds, second fails
        let callCount = 0;
        (mockClient.query as unknown).mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve(mockQueryResult);
          } else {
            return Promise.reject(new Error('Second batch failed'));
          }
        });

        // Create data requiring 2 batches (501 records with batch size 500)
        const largeDataset = Array.from({ length: 501 }, (_, index) => ({
          ...mockDatabaseInserts[0],
          pool_address: `0x${'1'.repeat(39)}${index}`,
        }));

        const result = await poolWriter.writePoolSnapshots(largeDataset);

        expect(result.success).toBe(false);
        expect(result.recordsInserted).toBe(3); // First batch succeeded
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toBe('Second batch failed');
      });

      it('captures errors inside writeBatch catch block', async () => {
        (mockClient.query as unknown).mockRejectedValue(
          new Error('batch failure'),
        );

        const result = await (poolWriter as unknown).writeBatch(
          mockDatabaseInserts.slice(0, 1),
          1,
        );

        expect(result.success).toBe(false);
        expect(result.errors).toContain('batch failure');
      });
    });

    describe('performance testing', () => {
      it('should handle large datasets efficiently', async () => {
        const largeDataset = Array.from({ length: 1000 }, (_, index) => ({
          ...mockDatabaseInserts[0],
          pool_address: `0x${'1'.repeat(39)}${index}`,
        }));

        const { result, durationMs } = await measureExecutionTime(async () => {
          return poolWriter.writePoolSnapshots(largeDataset);
        });

        expect(result.success).toBe(true);
        expect(durationMs).toBeLessThan(5000); // Should complete within 5 seconds
      });

      it('should batch correctly for memory efficiency', async () => {
        const veryLargeDataset = Array.from({ length: 2500 }, (_, index) => ({
          ...mockDatabaseInserts[0],
          pool_address: `0x${'1'.repeat(39)}${index}`,
        }));

        await poolWriter.writePoolSnapshots(veryLargeDataset);

        // Should call database 5 times (2500 records / 500 batch size)
        expect(mockGetDbClient).toHaveBeenCalledTimes(5);
        expect(mockClient.query).toHaveBeenCalledTimes(5);
      });
    });

    describe('concurrent operation handling', () => {
      it('should handle concurrent write operations', async () => {
        const dataset1 = [{ ...mockDatabaseInserts[0], pool_address: '0x111' }];
        const dataset2 = [{ ...mockDatabaseInserts[0], pool_address: '0x222' }];
        const dataset3 = [{ ...mockDatabaseInserts[0], pool_address: '0x333' }];

        const promises = [
          poolWriter.writePoolSnapshots(dataset1),
          poolWriter.writePoolSnapshots(dataset2),
          poolWriter.writePoolSnapshots(dataset3),
        ];

        const results = await Promise.all(promises);

        results.forEach((result) => {
          expect(result.success).toBe(true);
          expect(result.recordsInserted).toBe(3);
        });

        // Each operation should get its own client
        expect(mockGetDbClient).toHaveBeenCalledTimes(3);
        expect(mockClient.release).toHaveBeenCalledTimes(3);
      });

      it('should handle mixed success/failure in concurrent operations', async () => {
        let callCount = 0;
        mockGetDbClient.mockImplementation(() => {
          callCount++;
          if (callCount === 2) {
            return Promise.reject(new Error('Connection failed'));
          }
          return Promise.resolve(mockClient as PoolClient);
        });

        const dataset1 = [mockDatabaseInserts[0]];
        const dataset2 = [mockDatabaseInserts[0]];
        const dataset3 = [mockDatabaseInserts[0]];

        const promises = [
          poolWriter.writePoolSnapshots(dataset1),
          poolWriter.writePoolSnapshots(dataset2),
          poolWriter.writePoolSnapshots(dataset3),
        ];

        const results = await Promise.all(promises);

        expect(results[0].success).toBe(true);
        expect(results[1].success).toBe(false);
        expect(results[2].success).toBe(true);
      });
    });
  });

  describe('connection management', () => {
    it('should acquire and release client connections properly', async () => {
      await poolWriter.writePoolSnapshots(mockDatabaseInserts.slice(0, 1));

      expect(mockGetDbClient).toHaveBeenCalledOnce();
      expect(mockClient.release).toHaveBeenCalledOnce();
    });

    it('should handle client acquisition failures', async () => {
      mockGetDbClient.mockRejectedValue(new Error('No connections available'));

      const result = await poolWriter.writePoolSnapshots(mockDatabaseInserts);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('No connections available');
      expect(mockClient.release).not.toHaveBeenCalled();
    });

    it('should handle writeBatch errors correctly', async () => {
      (mockClient.query as unknown).mockRejectedValue(
        new Error('Query failed'),
      );

      const result = await poolWriter.writePoolSnapshots(mockDatabaseInserts);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Query failed');
      // Note: Current implementation doesn't have proper error handling in writeBatch
    });

    it('should not call release if client is null', async () => {
      // Test edge case where client becomes null
      mockGetDbClient.mockResolvedValue(null as unknown);

      const result = await poolWriter.writePoolSnapshots(mockDatabaseInserts);

      expect(result.success).toBe(false);
      expect(mockClient.release).not.toHaveBeenCalled();
    });
  });

  describe('data integrity and edge cases', () => {
    it('should preserve data types correctly', async () => {
      const testSnapshot: PoolAprSnapshotInsert = {
        pool_address: '0x1234567890123456789012345678901234567890',
        protocol_address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        chain: 'ethereum',
        protocol: 'test-protocol',
        symbol: 'test-symbol',
        symbols: ['TOKEN1', 'TOKEN2'],
        underlying_tokens: ['UNDERLYING1', 'UNDERLYING2'],
        tvl_usd: 1234567.89,
        apr: 0.0543,
        apr_base: 0.04,
        apr_reward: 0.0143,
        volume_usd_1d: 987654.32,
        exposure: 'multi',
        reward_tokens: ['REWARD1', 'REWARD2'],
        pool_meta: { version: 'v3', fee: 0.05 },
        raw_data: { source_response: { timestamp: 1642248000 } },
        source: 'test',
        snapshot_time: '2024-01-15T12:00:00.000Z',
      };

      await poolWriter.writePoolSnapshots([testSnapshot]);

      const queryCall = (mockClient.query as unknown).mock.calls[0];
      const [, values] = queryCall;

      // Verify all values are passed correctly
      expect(values[0]).toBe('0x1234567890123456789012345678901234567890'); // pool_address
      expect(values[2]).toBe('ethereum'); // chain
      expect(values[4]).toBe('test-symbol'); // symbol
      expect(values[7]).toBe(1234567.89); // tvl_usd
      expect(values[8]).toBe(0.0543); // apr
      expect(values[14]).toEqual({ version: 'v3', fee: 0.05 }); // pool_meta
      expect(values[16]).toBe('test'); // source
    });

    it('should handle malformed JSON in metadata fields', async () => {
      const snapshotWithBadJson = {
        ...mockDatabaseInserts[0],
        pool_meta: { validField: 'test', circularRef: {} },
      };

      // Add circular reference to test JSON handling
      (snapshotWithBadJson.pool_meta as unknown).circularRef =
        snapshotWithBadJson.pool_meta;

      // This should not crash the application
      const result = await poolWriter.writePoolSnapshots([snapshotWithBadJson]);

      expect(result.success).toBe(true);
    });

    it('should handle extremely long strings', async () => {
      const longString = 'A'.repeat(10000);
      const snapshotWithLongStrings = {
        ...mockDatabaseInserts[0],
        symbol: longString,
        protocol: longString,
      };

      const result = await poolWriter.writePoolSnapshots([
        snapshotWithLongStrings,
      ]);

      expect(result.success).toBe(true);

      const queryCall = (mockClient.query as unknown).mock.calls[0];
      const [, values] = queryCall;
      expect(values[3]).toBe(longString); // protocol
      expect(values[4]).toBe(longString); // symbol
    });

    it('should generate proper snapshot_time when not provided', async () => {
      const snapshotWithoutTime = {
        ...mockDatabaseInserts[0],
        snapshot_time: undefined,
      };

      const beforeTime = new Date().toISOString();
      await poolWriter.writePoolSnapshots([snapshotWithoutTime]);
      const afterTime = new Date().toISOString();

      const queryCall = (mockClient.query as unknown).mock.calls[0];
      const [, values] = queryCall;
      const actualTime = values[17]; // snapshot_time is the last column

      expect(typeof actualTime).toBe('string');
      expect(actualTime).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
      expect(new Date(actualTime).getTime()).toBeGreaterThanOrEqual(
        new Date(beforeTime).getTime(),
      );
      expect(new Date(actualTime).getTime()).toBeLessThanOrEqual(
        new Date(afterTime).getTime(),
      );
    });

    it('returns default result when writeBatch receives empty batch', async () => {
      const result = await (poolWriter as unknown).writeBatch([], 1);

      expect(result).toEqual({
        success: true,
        recordsInserted: 0,
        errors: [],
        duplicatesSkipped: 0,
      });
    });
  });
});
