/* eslint-disable max-lines-per-function */
/**
 * Comprehensive unit tests for PortfolioItemWriter
 * Tests JSONB serialization, required field validation, batch processing, ON CONFLICT behavior, and error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PortfolioItemSnapshotInsert } from '../../../../src/types/database.js';
import type { QueryResult } from 'pg';
import type { PortfolioItemWriter } from '../../../../src/modules/wallet/portfolioWriter.js';

// Hoisted mocks for proper timing
const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock logger before imports
vi.mock('../../../../src/utils/logger.js', () => ({
  logger: mockLogger,
}));

// Note: tables.js was merged into database.js - getTableName now comes from there

type MockClient = {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
};

type WithDatabaseClientOperation = (client: MockClient) => Promise<unknown>;

function mockWithClient(
  withDatabaseClientSpy: ReturnType<typeof vi.spyOn>,
  mockClient: MockClient
): void {
  withDatabaseClientSpy.mockImplementation(async (operation: WithDatabaseClientOperation) => {
    return operation(mockClient);
  });
}

describe('PortfolioItemWriter', () => {
  let writer: PortfolioItemWriter;
  let mockClient: MockClient;
  let withDatabaseClientSpy: ReturnType<typeof vi.spyOn>;

  // Helper to create valid portfolio snapshot records
  const createPortfolioSnapshot = (overrides: Partial<PortfolioItemSnapshotInsert> = {}): PortfolioItemSnapshotInsert => ({
    wallet: '0x1234567890123456789012345678901234567890',
    chain: 'hyperliquid',
    name: 'Hyperliquid',
    name_item: 'Vault Position',
    id_raw: 'hyperliquid_vault_0xdfc24b077bc1425ad1dea75bcb6f8158e10df303',
    asset_usd_value: 1000.50,
    detail: { type: 'vault', status: 'active' },
    snapshot_at: '2024-01-01T00:00:00Z',
    has_supported_portfolio: true,
    site_url: 'https://hyperliquid.xyz',
    asset_dict: { vault: { address: '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303' } },
    asset_token_list: [{ symbol: 'HLP', amount: 100 }],
    detail_types: ['vault'],
    pool: { name: 'Test Vault', tvl: 5000000 },
    proxy_detail: { proxy: 'none' },
    debt_usd_value: 0,
    net_usd_value: 1000.50,
    update_at: 1704067200,
    ...overrides,
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create mock database client
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };

    // Import and instantiate writer
    const { PortfolioItemWriter } = await import('../../../../src/modules/wallet/portfolioWriter.js');
    writer = new PortfolioItemWriter();

    // Spy on withDatabaseClient to intercept database operations
    withDatabaseClientSpy = vi.spyOn(writer as unknown as object, 'withDatabaseClient');
  });

  describe('Empty and Single Record Operations', () => {
    it('should return success with 0 records when records array is empty', async () => {
      const result = await writer.writeSnapshots([]);

      expect(result).toEqual({
        success: true,
        recordsInserted: 0,
        duplicatesSkipped: 0,
        errors: [],
      });

      expect(withDatabaseClientSpy).not.toHaveBeenCalled();
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('returns default result when writeBatch receives empty batch', async () => {
      const result = await (writer as unknown).writeBatch([], 1);

      expect(result).toEqual({
        success: true,
        recordsInserted: 0,
        duplicatesSkipped: 0,
        errors: [],
      });
    });

    it('logs and records invalid snapshots', async () => {
      const result = await (writer as unknown).writeBatch([
        { wallet: '', id_raw: '' } as unknown
      ], 1);

      expect(result.errors[0]).toContain('Invalid portfolio snapshot');
      expect(result.success).toBe(true);
    });

    it('should insert a single valid record successfully', async () => {
      const record = createPortfolioSnapshot();
      const mockQueryResult: QueryResult = {
        rows: [{ '?column?': 1 }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      };

      mockWithClient(withDatabaseClientSpy, mockClient);

      mockClient.query.mockResolvedValue(mockQueryResult);

      const result = await writer.writeSnapshots([record]);

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(1);
      expect(result.errors).toEqual([]);

      expect(withDatabaseClientSpy).toHaveBeenCalledTimes(1);
      expect(mockClient.query).toHaveBeenCalledTimes(1);

      // Verify SQL query structure
      const [sql, values] = mockClient.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO public.portfolio_item_snapshots');
      expect(sql).not.toContain('ON CONFLICT'); // No longer using ON CONFLICT
      expect(values).toHaveLength(18); // All columns for 1 record (removed user_id)
    });
  });

  describe('Required Field Validation', () => {
    it('should accept record without user_id field', async () => {
      // Test that records without user_id are accepted since field is removed
      const record = createPortfolioSnapshot();

      const mockQueryResult: QueryResult = {
        rows: [{ '?column?': 1 }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      };

      mockWithClient(withDatabaseClientSpy, mockClient);

      mockClient.query.mockResolvedValue(mockQueryResult);

      const result = await writer.writeSnapshots([record]);

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(1);
      expect(result.errors).toEqual([]);
    });

    it('should reject record missing wallet', async () => {
      const invalidRecord = createPortfolioSnapshot({ wallet: '' } as unknown);

      mockWithClient(withDatabaseClientSpy, mockClient);

      const result = await writer.writeSnapshots([invalidRecord]);

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(0);
      expect(result.errors.length).toBe(1);

      expect(mockLogger.warn).toHaveBeenCalled();
      expect(withDatabaseClientSpy).not.toHaveBeenCalled();
    });

    it('should reject record missing id_raw', async () => {
      const invalidRecord = createPortfolioSnapshot({ id_raw: '' } as unknown);

      mockWithClient(withDatabaseClientSpy, mockClient);

      const result = await writer.writeSnapshots([invalidRecord]);

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(0);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('Invalid portfolio snapshot encountered');

      expect(mockLogger.warn).toHaveBeenCalled();
      expect(withDatabaseClientSpy).not.toHaveBeenCalled();
    });

    it('should use fallback labels when wallet or id_raw are undefined', async () => {
      const invalidRecord = createPortfolioSnapshot({
        wallet: undefined,
        id_raw: undefined,
      });

      const result = await writer.writeSnapshots([invalidRecord]);

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(0);
      expect(result.errors).toEqual([
        'Invalid portfolio snapshot encountered for wallet unknown (missing id)'
      ]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid portfolio snapshot encountered for wallet unknown (missing id)'
      );
      expect(withDatabaseClientSpy).not.toHaveBeenCalled();
    });

    it('should filter out invalid records and process valid ones', async () => {
      const records = [
        createPortfolioSnapshot({ id_raw: '' } as unknown), // Invalid - missing id_raw
        createPortfolioSnapshot({ id_raw: 'id-1' }), // Valid
        createPortfolioSnapshot({ wallet: '', id_raw: 'id-2' } as unknown), // Invalid - missing wallet
        createPortfolioSnapshot({ id_raw: 'id-2' }), // Valid
      ];

      const mockQueryResult: QueryResult = {
        rows: [{ '?column?': 1 }, { '?column?': 1 }],
        rowCount: 2,
        command: 'INSERT',
        oid: 0,
        fields: [],
      };

      mockWithClient(withDatabaseClientSpy, mockClient);

      mockClient.query.mockResolvedValue(mockQueryResult);

      const result = await writer.writeSnapshots(records);

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(2); // Only valid records
      expect(result.errors.length).toBe(2); // Two validation errors

      // Should log warnings for invalid records
      expect(mockLogger.warn).toHaveBeenCalledTimes(2);

      // Should only query with valid records
      const [, values] = mockClient.query.mock.calls[0];
      expect(values).toHaveLength(2 * 18); // 2 valid records × 18 columns
    });

    it('should handle batch with all invalid records', async () => {
      const records = [
        createPortfolioSnapshot({ wallet: '' } as unknown),
        createPortfolioSnapshot({ id_raw: '' } as unknown),
      ];

      const result = await writer.writeSnapshots(records);

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(0);
      expect(result.errors.length).toBe(2);

      // Should not make database call
      expect(withDatabaseClientSpy).not.toHaveBeenCalled();
      expect(mockClient.query).not.toHaveBeenCalled();
    });
  });

  describe('JSONB Serialization', () => {
    it('should serialize all JSONB fields using JSON.stringify', async () => {
      const record = createPortfolioSnapshot({
        detail: { key: 'value', nested: { data: 123 } },
        asset_dict: { token: 'HLP', balance: 100 },
        asset_token_list: [{ symbol: 'HLP' }, { symbol: 'USDC' }],
        pool: { name: 'Vault', tvl: 1000000 },
        proxy_detail: { proxy_type: 'delegated' },
      });

      const mockQueryResult: QueryResult = {
        rows: [{ '?column?': 1 }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      };

      mockWithClient(withDatabaseClientSpy, mockClient);

      mockClient.query.mockResolvedValue(mockQueryResult);

      await writer.writeSnapshots([record]);

      const [, values] = mockClient.query.mock.calls[0];

      // Verify JSONB fields are serialized
      expect(values[6]).toBe(JSON.stringify({ key: 'value', nested: { data: 123 } })); // detail
      expect(values[10]).toBe(JSON.stringify({ token: 'HLP', balance: 100 })); // asset_dict
      expect(values[11]).toBe(JSON.stringify([{ symbol: 'HLP' }, { symbol: 'USDC' }])); // asset_token_list
      expect(values[13]).toBe(JSON.stringify({ name: 'Vault', tvl: 1000000 })); // pool
      expect(values[14]).toBe(JSON.stringify({ proxy_type: 'delegated' })); // proxy_detail
    });

    it('should handle null JSONB fields correctly', async () => {
      const record = createPortfolioSnapshot({
        detail: null as unknown,
        asset_dict: null as unknown,
        asset_token_list: null as unknown,
        pool: null as unknown,
        proxy_detail: null as unknown,
      });

      const mockQueryResult: QueryResult = {
        rows: [{ '?column?': 1 }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      };

      mockWithClient(withDatabaseClientSpy, mockClient);

      mockClient.query.mockResolvedValue(mockQueryResult);

      await writer.writeSnapshots([record]);

      const [, values] = mockClient.query.mock.calls[0];

      // Null values should be serialized as 'null' string
      expect(values[6]).toBe('null'); // detail
      expect(values[10]).toBe('null'); // asset_dict
      expect(values[11]).toBe('null'); // asset_token_list
      expect(values[13]).toBe('null'); // pool
      expect(values[14]).toBe('null'); // proxy_detail
    });

    it('should handle undefined JSONB fields correctly', async () => {
      const record = createPortfolioSnapshot({
        detail: undefined as unknown,
        asset_dict: undefined as unknown,
        asset_token_list: undefined as unknown,
        pool: undefined as unknown,
        proxy_detail: undefined as unknown,
      });

      const mockQueryResult: QueryResult = {
        rows: [{ '?column?': 1 }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      };

      mockWithClient(withDatabaseClientSpy, mockClient);

      mockClient.query.mockResolvedValue(mockQueryResult);

      await writer.writeSnapshots([record]);

      const [, values] = mockClient.query.mock.calls[0];

      // Undefined values should be serialized as 'null' string via serializeJson
      expect(values[6]).toBe('null'); // detail
      expect(values[10]).toBe('null'); // asset_dict
      expect(values[11]).toBe('null'); // asset_token_list
      expect(values[13]).toBe('null'); // pool
      expect(values[14]).toBe('null'); // proxy_detail
    });

    it('should handle complex nested JSONB structures', async () => {
      const complexDetail = {
        vault: {
          address: '0xabc',
          positions: [
            { token: 'USDC', amount: 1000 },
            { token: 'ETH', amount: 0.5 },
          ],
        },
        metadata: {
          created: '2024-01-01',
          tags: ['vault', 'defi', 'yield'],
        },
      };

      const record = createPortfolioSnapshot({ detail: complexDetail });

      const mockQueryResult: QueryResult = {
        rows: [{ '?column?': 1 }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      };

      mockWithClient(withDatabaseClientSpy, mockClient);

      mockClient.query.mockResolvedValue(mockQueryResult);

      await writer.writeSnapshots([record]);

      const [, values] = mockClient.query.mock.calls[0];

      expect(values[6]).toBe(JSON.stringify(complexDetail));
      expect(JSON.parse(values[6] as string)).toEqual(complexDetail);
    });
  });

  describe('Batch Processing', () => {
    it('should process 50 records in a single batch', async () => {
      const records = Array.from({ length: 50 }, (_, i) =>
        createPortfolioSnapshot({
          id_raw: `id-${i}`,
        })
      );

      const mockQueryResult: QueryResult = {
        rows: Array(50).fill({ '?column?': 1 }),
        rowCount: 50,
        command: 'INSERT',
        oid: 0,
        fields: [],
      };

      mockWithClient(withDatabaseClientSpy, mockClient);

      mockClient.query.mockResolvedValue(mockQueryResult);

      const result = await writer.writeSnapshots(records);

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(50);

      // Should only call database once (single batch)
      expect(withDatabaseClientSpy).toHaveBeenCalledTimes(1);
      expect(mockClient.query).toHaveBeenCalledTimes(1);

      // Verify all records are in the query
      const [sql, values] = mockClient.query.mock.calls[0];
      expect(values).toHaveLength(50 * 18); // 50 records × 18 columns
    });

    it('should process exactly 100 records in a single batch (boundary test)', async () => {
      const records = Array.from({ length: 100 }, (_, i) =>
        createPortfolioSnapshot({
          id_raw: `id-${i}`,
        })
      );

      const mockQueryResult: QueryResult = {
        rows: Array(100).fill({ '?column?': 1 }),
        rowCount: 100,
        command: 'INSERT',
        oid: 0,
        fields: [],
      };

      mockWithClient(withDatabaseClientSpy, mockClient);

      mockClient.query.mockResolvedValue(mockQueryResult);

      const result = await writer.writeSnapshots(records);

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(100);

      // Should be exactly one batch
      expect(withDatabaseClientSpy).toHaveBeenCalledTimes(1);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Processing DeBank portfolio batch',
        { batchNumber: 1, batchSize: 100 }
      );
    });

    it('should process 101 records in two batches (boundary test)', async () => {
      const records = Array.from({ length: 101 }, (_, i) =>
        createPortfolioSnapshot({
          id_raw: `id-${i}`,
        })
      );

      const mockQueryResult1: QueryResult = {
        rows: Array(100).fill({ '?column?': 1 }),
        rowCount: 100,
        command: 'INSERT',
        oid: 0,
        fields: [],
      };

      const mockQueryResult2: QueryResult = {
        rows: [{ '?column?': 1 }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      };

      mockWithClient(withDatabaseClientSpy, mockClient);

      mockClient.query
        .mockResolvedValueOnce(mockQueryResult1)
        .mockResolvedValueOnce(mockQueryResult2);

      const result = await writer.writeSnapshots(records);

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(101);

      // Should call database twice (two batches)
      expect(withDatabaseClientSpy).toHaveBeenCalledTimes(2);

      // Verify batch sizes
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Processing DeBank portfolio batch',
        { batchNumber: 1, batchSize: 100 }
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Processing DeBank portfolio batch',
        { batchNumber: 2, batchSize: 1 }
      );
    });

    it('should process 150 records across multiple batches', async () => {
      const records = Array.from({ length: 150 }, (_, i) =>
        createPortfolioSnapshot({
          id_raw: `id-${i}`,
        })
      );

      const mockQueryResult1: QueryResult = {
        rows: Array(100).fill({ '?column?': 1 }),
        rowCount: 100,
        command: 'INSERT',
        oid: 0,
        fields: [],
      };

      const mockQueryResult2: QueryResult = {
        rows: Array(50).fill({ '?column?': 1 }),
        rowCount: 50,
        command: 'INSERT',
        oid: 0,
        fields: [],
      };

      mockWithClient(withDatabaseClientSpy, mockClient);

      mockClient.query
        .mockResolvedValueOnce(mockQueryResult1)
        .mockResolvedValueOnce(mockQueryResult2);

      const result = await writer.writeSnapshots(records);

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(150);
      expect(result.errors).toEqual([]);

      expect(withDatabaseClientSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle database query error and return failure', async () => {
      const record = createPortfolioSnapshot();
      const dbError = new Error('Constraint violation');

      mockWithClient(withDatabaseClientSpy, mockClient);

      mockClient.query.mockRejectedValue(dbError);

      const result = await writer.writeSnapshots([record]);

      expect(result.success).toBe(false);
      expect(result.recordsInserted).toBe(0);
      expect(result.errors).toEqual(['Constraint violation']);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'DeBank portfolio batch write failed',
        {
          batchNumber: 1,
          error: 'Constraint violation',
        }
      );
    });

    it('should handle non-Error exceptions gracefully', async () => {
      const record = createPortfolioSnapshot();

      mockWithClient(withDatabaseClientSpy, mockClient);

      mockClient.query.mockRejectedValue('String error');

      const result = await writer.writeSnapshots([record]);

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(['Unknown error']);
    });

    it('should handle partial batch failures and continue processing', async () => {
      const records = Array.from({ length: 150 }, (_, i) =>
        createPortfolioSnapshot({
          id_raw: `id-${i}`,
        })
      );

      const mockQueryResult: QueryResult = {
        rows: Array(100).fill({ '?column?': 1 }),
        rowCount: 100,
        command: 'INSERT',
        oid: 0,
        fields: [],
      };

      const dbError = new Error('Second batch failed');

      mockWithClient(withDatabaseClientSpy, mockClient);

      mockClient.query
        .mockResolvedValueOnce(mockQueryResult)
        .mockRejectedValueOnce(dbError);

      const result = await writer.writeSnapshots(records);

      expect(result.success).toBe(false);
      expect(result.recordsInserted).toBe(100); // First batch succeeded
      expect(result.errors).toEqual(['Second batch failed']);

      // Both batches should have been attempted
      expect(withDatabaseClientSpy).toHaveBeenCalledTimes(2);
    });

    it('should aggregate multiple batch errors', async () => {
      const records = Array.from({ length: 250 }, (_, i) =>
        createPortfolioSnapshot({
          id_raw: `id-${i}`,
        })
      );

      mockWithClient(withDatabaseClientSpy, mockClient);

      mockClient.query
        .mockRejectedValueOnce(new Error('Batch 1 error'))
        .mockRejectedValueOnce(new Error('Batch 2 error'))
        .mockRejectedValueOnce(new Error('Batch 3 error'));

      const result = await writer.writeSnapshots(records);

      expect(result.success).toBe(false);
      expect(result.recordsInserted).toBe(0);
      expect(result.errors).toEqual(['Batch 1 error', 'Batch 2 error', 'Batch 3 error']);
    });

    it('should handle null rowCount from database', async () => {
      const records = Array.from({ length: 5 }, (_, i) =>
        createPortfolioSnapshot({
          id_raw: `id-${i}`,
        })
      );

      const mockQueryResult: QueryResult = {
        rows: [],
        rowCount: null, // Database returns null
        command: 'INSERT',
        oid: 0,
        fields: [],
      };

      mockWithClient(withDatabaseClientSpy, mockClient);

      mockClient.query.mockResolvedValue(mockQueryResult);

      const result = await writer.writeSnapshots(records);

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(0); // Should handle null as 0
    });
  });

  describe('SQL Query Generation', () => {
    it('should generate parameterized query with all columns', async () => {
      const record = createPortfolioSnapshot();

      mockWithClient(withDatabaseClientSpy, mockClient);

      mockClient.query.mockResolvedValue({ rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] });

      await writer.writeSnapshots([record]);

      const [sql, values] = mockClient.query.mock.calls[0];

      // Verify all columns are present
      const expectedColumns = [
        'wallet',
        'chain',
        'name',
        'name_item',
        'id_raw',
        'asset_usd_value',
        'detail',
        'snapshot_at',
        'has_supported_portfolio',
        'site_url',
        'asset_dict',
        'asset_token_list',
        'detail_types',
        'pool',
        'proxy_detail',
        'debt_usd_value',
        'net_usd_value',
        'update_at',
      ];

      for (const column of expectedColumns) {
        expect(sql).toContain(column);
      }

      // Verify values are correctly ordered
      expect(values[0]).toBe('0x1234567890123456789012345678901234567890'); // wallet
      expect(values[1]).toBe('hyperliquid'); // chain
      expect(values[4]).toBe('hyperliquid_vault_0xdfc24b077bc1425ad1dea75bcb6f8158e10df303'); // id_raw
    });

    it('should generate proper placeholders for multiple records', async () => {
      const records = [
        createPortfolioSnapshot({ id_raw: 'id-1' }),
        createPortfolioSnapshot({ id_raw: 'id-2' }),
      ];

      mockWithClient(withDatabaseClientSpy, mockClient);

      mockClient.query.mockResolvedValue({ rows: [], rowCount: 2, command: 'INSERT', oid: 0, fields: [] });

      await writer.writeSnapshots(records);

      const [sql, values] = mockClient.query.mock.calls[0];

      // Should have two value sets
      expect(sql).toMatch(/\(\$1, \$2, \$3.*\$18\)/); // First record
      expect(sql).toMatch(/\(\$19, \$20, \$21.*\$36\)/); // Second record

      expect(values).toHaveLength(36); // 2 records × 18 columns
    });

    it('should prevent SQL injection via parameterized queries', async () => {
      const maliciousRecord = createPortfolioSnapshot({
        wallet: "<script>alert('xss')</script>",
        id_raw: "id' OR '1'='1",
      });

      mockWithClient(withDatabaseClientSpy, mockClient);

      mockClient.query.mockResolvedValue({ rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] });

      await writer.writeSnapshots([maliciousRecord]);

      const [sql, values] = mockClient.query.mock.calls[0];

      // SQL should only contain placeholders, not actual values
      expect(sql).not.toContain('DROP TABLE');
      expect(sql).not.toContain('<script>');
      expect(sql).not.toContain("OR '1'='1");

      // Values should be properly passed as parameters
      expect(values[0]).toBe("<script>alert('xss')</script>"); // wallet
      expect(values[4]).toBe("id' OR '1'='1"); // id_raw
    });
  });

  describe('Logging', () => {
    it('should log comprehensive processing information', async () => {
      const records = Array.from({ length: 150 }, (_, i) =>
        createPortfolioSnapshot({
          id_raw: `id-${i}`,
        })
      );

      const mockQueryResult1: QueryResult = {
        rows: Array(97).fill({ '?column?': 1 }),
        rowCount: 97, // 3 duplicates
        command: 'INSERT',
        oid: 0,
        fields: [],
      };

      const mockQueryResult2: QueryResult = {
        rows: Array(48).fill({ '?column?': 1 }),
        rowCount: 48, // 2 duplicates
        command: 'INSERT',
        oid: 0,
        fields: [],
      };

      mockWithClient(withDatabaseClientSpy, mockClient);

      mockClient.query
        .mockResolvedValueOnce(mockQueryResult1)
        .mockResolvedValueOnce(mockQueryResult2);

      await writer.writeSnapshots(records);

      // Should log start
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting DeBank portfolio snapshots write',
        {
          totalRecords: 150,
          batchSize: 100,
        }
      );

      // Should log completion
      expect(mockLogger.info).toHaveBeenCalledWith(
        'DeBank portfolio snapshots write completed',
        {
          totalRecords: 150,
          recordsInserted: 145,
          duplicatesSkipped: 5,
          errors: 0,
          success: true,
        }
      );

      // Should log each batch
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Processing DeBank portfolio batch',
        { batchNumber: 1, batchSize: 100 }
      );

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'DeBank portfolio batch written',
        { batchNumber: 1, recordsInserted: 97 }
      );
    });

    it('should not log when array is empty', async () => {
      await writer.writeSnapshots([]);

      expect(mockLogger.info).not.toHaveBeenCalled();
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should log validation warnings with wallet context', async () => {
      const record = createPortfolioSnapshot({
        wallet: '',
        id_raw: 'test-id',
      } as unknown);

      await writer.writeSnapshots([record]);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid portfolio snapshot encountered for wallet')
      );
    });
  });

  describe('Data Integrity', () => {
    it('should preserve array types in detail_types', async () => {
      const record = createPortfolioSnapshot({
        detail_types: ['vault', 'lending', 'staking'],
      });

      mockWithClient(withDatabaseClientSpy, mockClient);

      mockClient.query.mockResolvedValue({ rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] });

      await writer.writeSnapshots([record]);

      const [, values] = mockClient.query.mock.calls[0];

      expect(values[12]).toEqual(['vault', 'lending', 'staking']); // detail_types not serialized
    });

    it('should preserve numeric precision', async () => {
      const record = createPortfolioSnapshot({
        asset_usd_value: 12345.6789,
        debt_usd_value: 100.00001,
        net_usd_value: 12245.67889,
      });

      mockWithClient(withDatabaseClientSpy, mockClient);

      mockClient.query.mockResolvedValue({ rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] });

      await writer.writeSnapshots([record]);

      const [, values] = mockClient.query.mock.calls[0];

      expect(values[5]).toBe(12345.6789); // asset_usd_value
      expect(values[15]).toBe(100.00001); // debt_usd_value
      expect(values[16]).toBe(12245.67889); // net_usd_value
    });

    it('should preserve boolean values', async () => {
      const record = createPortfolioSnapshot({
        has_supported_portfolio: false,
      });

      mockWithClient(withDatabaseClientSpy, mockClient);

      mockClient.query.mockResolvedValue({ rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] });

      await writer.writeSnapshots([record]);

      const [, values] = mockClient.query.mock.calls[0];

      expect(values[8]).toBe(false); // has_supported_portfolio
    });

    it('should handle empty arrays in asset_token_list', async () => {
      const record = createPortfolioSnapshot({
        asset_token_list: [],
      });

      mockWithClient(withDatabaseClientSpy, mockClient);

      mockClient.query.mockResolvedValue({ rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] });

      await writer.writeSnapshots([record]);

      const [, values] = mockClient.query.mock.calls[0];

      expect(values[11]).toBe('[]'); // Empty array serialized
    });

    it('should handle empty objects in JSONB fields', async () => {
      const record = createPortfolioSnapshot({
        detail: {},
        asset_dict: {},
        pool: {},
        proxy_detail: {},
      });

      mockWithClient(withDatabaseClientSpy, mockClient);

      mockClient.query.mockResolvedValue({ rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] });

      await writer.writeSnapshots([record]);

      const [, values] = mockClient.query.mock.calls[0];

      expect(values[6]).toBe('{}'); // detail
      expect(values[10]).toBe('{}'); // asset_dict
      expect(values[13]).toBe('{}'); // pool
      expect(values[14]).toBe('{}'); // proxy_detail
    });
  });
});
