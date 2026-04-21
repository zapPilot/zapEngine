/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Comprehensive unit tests for HyperliquidVaultAprWriter
 * Tests batch processing, upsert behavior, duplicate tracking, error handling, and edge cases
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { HyperliquidVaultAprSnapshotInsert } from "../../../../src/types/database.js";
import type { QueryResult } from "pg";

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
vi.mock("../../../../src/utils/logger.js", () => ({
  logger: mockLogger,
}));

// Note: tables.js was merged into database.js - getTableName now comes from there

describe("HyperliquidVaultAprWriter", () => {
  let writer: unknown;
  let mockClient: unknown;
  let withDatabaseClientSpy: unknown;

  // Helper to create valid snapshot records
  const createSnapshot = (
    overrides: Partial<HyperliquidVaultAprSnapshotInsert> = {},
  ): HyperliquidVaultAprSnapshotInsert => ({
    source: "hyperliquid",
    vault_address: "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303",
    vault_name: "Test Vault",
    leader_address: "0x677d8f50e9983013d4def386a1ac30c60e536f3a",
    apr: 0.1234,
    apr_base: 0.1,
    apr_reward: 0.0234,
    tvl_usd: 1000000,
    total_followers: 50,
    leader_commission: 0.05,
    leader_fraction: 0.15,
    is_closed: false,
    allow_deposits: true,
    pool_meta: { category: "vault" },
    raw_data: { raw: "data" },
    snapshot_time: "2024-01-01T00:00:00Z",
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
    const { HyperliquidVaultAprWriter } =
      await import("../../../../src/modules/hyperliquid/aprWriter.js");
    writer = new HyperliquidVaultAprWriter();

    // Spy on withDatabaseClient to intercept database operations
    withDatabaseClientSpy = vi.spyOn(writer as unknown, "withDatabaseClient");
  });

  describe("Empty and Single Record Operations", () => {
    it("should return success with 0 records when snapshots array is empty", async () => {
      const result = await writer.writeSnapshots([]);

      expect(result).toEqual({
        success: true,
        recordsInserted: 0,
        errors: [],
        duplicatesSkipped: 0,
      });

      expect(withDatabaseClientSpy).not.toHaveBeenCalled();
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it("should insert a single record successfully", async () => {
      const snapshot = createSnapshot();
      const mockQueryResult: QueryResult = {
        rows: [{ "?column?": 1 }],
        rowCount: 1,
        command: "INSERT",
        oid: 0,
        fields: [],
      };

      withDatabaseClientSpy.mockImplementation(async (fn: any) => {
        return fn(mockClient);
      });

      mockClient.query.mockResolvedValue(mockQueryResult);

      const result = await writer.writeSnapshots([snapshot]);

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(1);
      expect(result.duplicatesSkipped).toBe(0);
      expect(result.errors).toEqual([]);

      expect(withDatabaseClientSpy).toHaveBeenCalledTimes(1);
      expect(mockClient.query).toHaveBeenCalledTimes(1);

      // Verify SQL query structure
      const [sql, values] = mockClient.query.mock.calls[0];
      expect(sql).toContain(
        "INSERT INTO alpha_raw.hyperliquid_vault_apr_snapshots",
      );
      expect(sql).toContain(
        "ON CONFLICT (vault_address, snapshot_time) DO UPDATE",
      );
      expect(values).toHaveLength(16); // All columns for 1 record
      expect(values[0]).toBe("hyperliquid"); // source
      expect(values[1]).toBe("0xdfc24b077bc1425ad1dea75bcb6f8158e10df303"); // vault_address
    });

    it("returns early from processBatches when records are empty", async () => {
      const result = await writer.writeSnapshots([]);

      expect(result).toEqual({
        success: true,
        recordsInserted: 0,
        errors: [],
        duplicatesSkipped: 0,
      });
      expect(withDatabaseClientSpy).not.toHaveBeenCalled();
    });
  });

  describe("Batch Processing", () => {
    it("should process 50 records in a single batch", async () => {
      const snapshots = Array.from({ length: 50 }, (_, i) =>
        createSnapshot({
          vault_address: `0x${i.toString().padStart(40, "0")}`,
        }),
      );

      const mockQueryResult: QueryResult = {
        rows: Array(50).fill({ "?column?": 1 }),
        rowCount: 50,
        command: "INSERT",
        oid: 0,
        fields: [],
      };

      withDatabaseClientSpy.mockImplementation(async (fn: any) => {
        return fn(mockClient);
      });

      mockClient.query.mockResolvedValue(mockQueryResult);

      const result = await writer.writeSnapshots(snapshots);

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(50);
      expect(result.duplicatesSkipped).toBe(0);
      expect(result.errors).toEqual([]);

      // Should only call database once (single batch)
      expect(withDatabaseClientSpy).toHaveBeenCalledTimes(1);
      expect(mockClient.query).toHaveBeenCalledTimes(1);

      // Verify all records are in the query
      const [, values] = mockClient.query.mock.calls[0];
      expect(values).toHaveLength(50 * 16); // 50 records × 16 columns
    });

    it("should process exactly 100 records in a single batch (boundary test)", async () => {
      const snapshots = Array.from({ length: 100 }, (_, i) =>
        createSnapshot({
          vault_address: `0x${i.toString().padStart(40, "0")}`,
        }),
      );

      const mockQueryResult: QueryResult = {
        rows: Array(100).fill({ "?column?": 1 }),
        rowCount: 100,
        command: "INSERT",
        oid: 0,
        fields: [],
      };

      withDatabaseClientSpy.mockImplementation(async (fn: any) => {
        return fn(mockClient);
      });

      mockClient.query.mockResolvedValue(mockQueryResult);

      const result = await writer.writeSnapshots(snapshots);

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(100);
      expect(result.duplicatesSkipped).toBe(0);

      // Should be exactly one batch
      expect(withDatabaseClientSpy).toHaveBeenCalledTimes(1);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Processing Hyperliquid APR batch",
        { batchNumber: 1, batchSize: 100 },
      );
    });

    it("should process 101 records in two batches (boundary test)", async () => {
      const snapshots = Array.from({ length: 101 }, (_, i) =>
        createSnapshot({
          vault_address: `0x${i.toString().padStart(40, "0")}`,
        }),
      );

      const mockQueryResult1: QueryResult = {
        rows: Array(100).fill({ "?column?": 1 }),
        rowCount: 100,
        command: "INSERT",
        oid: 0,
        fields: [],
      };

      const mockQueryResult2: QueryResult = {
        rows: [{ "?column?": 1 }],
        rowCount: 1,
        command: "INSERT",
        oid: 0,
        fields: [],
      };

      withDatabaseClientSpy.mockImplementation(async (fn: any) => {
        return fn(mockClient);
      });

      mockClient.query
        .mockResolvedValueOnce(mockQueryResult1)
        .mockResolvedValueOnce(mockQueryResult2);

      const result = await writer.writeSnapshots(snapshots);

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(101);
      expect(result.duplicatesSkipped).toBe(0);

      // Should call database twice (two batches)
      expect(withDatabaseClientSpy).toHaveBeenCalledTimes(2);
      expect(mockClient.query).toHaveBeenCalledTimes(2);

      // Verify batch sizes
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Processing Hyperliquid APR batch",
        { batchNumber: 1, batchSize: 100 },
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Processing Hyperliquid APR batch",
        { batchNumber: 2, batchSize: 1 },
      );
    });

    it("should process 150 records in two batches", async () => {
      const snapshots = Array.from({ length: 150 }, (_, i) =>
        createSnapshot({
          vault_address: `0x${i.toString().padStart(40, "0")}`,
        }),
      );

      const mockQueryResult1: QueryResult = {
        rows: Array(100).fill({ "?column?": 1 }),
        rowCount: 100,
        command: "INSERT",
        oid: 0,
        fields: [],
      };

      const mockQueryResult2: QueryResult = {
        rows: Array(50).fill({ "?column?": 1 }),
        rowCount: 50,
        command: "INSERT",
        oid: 0,
        fields: [],
      };

      withDatabaseClientSpy.mockImplementation(async (fn: any) => {
        return fn(mockClient);
      });

      mockClient.query
        .mockResolvedValueOnce(mockQueryResult1)
        .mockResolvedValueOnce(mockQueryResult2);

      const result = await writer.writeSnapshots(snapshots);

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(150);
      expect(result.duplicatesSkipped).toBe(0);
      expect(result.errors).toEqual([]);

      expect(withDatabaseClientSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("ON CONFLICT Upsert Behavior", () => {
    it("should track duplicates when ON CONFLICT triggers update", async () => {
      const snapshot = createSnapshot();

      // Simulate ON CONFLICT - rowCount is 0 when records are updated, not inserted
      const mockQueryResult: QueryResult = {
        rows: [],
        rowCount: 0,
        command: "INSERT",
        oid: 0,
        fields: [],
      };

      withDatabaseClientSpy.mockImplementation(async (fn: any) => {
        return fn(mockClient);
      });

      mockClient.query.mockResolvedValue(mockQueryResult);

      const result = await writer.writeSnapshots([snapshot]);

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(0);
      expect(result.duplicatesSkipped).toBe(1);
      expect(result.errors).toEqual([]);
    });

    it("should correctly track duplicates in batch with mixed insert/update", async () => {
      const snapshots = Array.from({ length: 10 }, (_, i) =>
        createSnapshot({
          vault_address: `0x${i.toString().padStart(40, "0")}`,
        }),
      );

      // Simulate 7 new inserts, 3 updates (duplicates)
      const mockQueryResult: QueryResult = {
        rows: Array(7).fill({ "?column?": 1 }),
        rowCount: 7,
        command: "INSERT",
        oid: 0,
        fields: [],
      };

      withDatabaseClientSpy.mockImplementation(async (fn: any) => {
        return fn(mockClient);
      });

      mockClient.query.mockResolvedValue(mockQueryResult);

      const result = await writer.writeSnapshots(snapshots);

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(7);
      expect(result.duplicatesSkipped).toBe(3);
    });

    it("should verify ON CONFLICT clause targets correct unique constraint", async () => {
      const snapshot = createSnapshot();

      withDatabaseClientSpy.mockImplementation(async (fn: any) => {
        return fn(mockClient);
      });

      mockClient.query.mockResolvedValue({
        rows: [],
        rowCount: 1,
        command: "INSERT",
        oid: 0,
        fields: [],
      });

      await writer.writeSnapshots([snapshot]);

      const [sql] = mockClient.query.mock.calls[0];
      expect(sql).toContain(
        "ON CONFLICT (vault_address, snapshot_time) DO UPDATE",
      );
    });

    it("should verify UPDATE SET clause excludes primary key columns", async () => {
      const snapshot = createSnapshot();

      withDatabaseClientSpy.mockImplementation(async (fn: any) => {
        return fn(mockClient);
      });

      mockClient.query.mockResolvedValue({
        rows: [],
        rowCount: 1,
        command: "INSERT",
        oid: 0,
        fields: [],
      });

      await writer.writeSnapshots([snapshot]);

      const [sql] = mockClient.query.mock.calls[0];

      // Should not update snapshot_time or source
      expect(sql).not.toMatch(/snapshot_time\s*=\s*EXCLUDED\.snapshot_time/);

      // Should update other fields
      expect(sql).toContain("vault_name = EXCLUDED.vault_name");
      expect(sql).toContain("apr = EXCLUDED.apr");
      expect(sql).toContain("tvl_usd = EXCLUDED.tvl_usd");
    });
  });

  describe("Error Handling", () => {
    it("should handle database client query error and return failure", async () => {
      const snapshot = createSnapshot();
      const dbError = new Error("Connection timeout");

      withDatabaseClientSpy.mockImplementation(async (fn: any) => {
        return fn(mockClient);
      });

      mockClient.query.mockRejectedValue(dbError);

      const result = await writer.writeSnapshots([snapshot]);

      expect(result.success).toBe(false);
      expect(result.recordsInserted).toBe(0);
      expect(result.duplicatesSkipped).toBe(0);
      expect(result.errors).toEqual(["Connection timeout"]);

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Hyperliquid APR batch write failed",
        {
          batchNumber: 1,
          error: "Connection timeout",
        },
      );
    });

    it("should handle non-Error exceptions gracefully", async () => {
      const snapshot = createSnapshot();

      withDatabaseClientSpy.mockImplementation(async (fn: any) => {
        return fn(mockClient);
      });

      mockClient.query.mockRejectedValue("String error message");

      const result = await writer.writeSnapshots([snapshot]);

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(["Unknown error"]);
    });

    it("should handle partial batch failures and continue processing", async () => {
      const snapshots = Array.from({ length: 150 }, (_, i) =>
        createSnapshot({
          vault_address: `0x${i.toString().padStart(40, "0")}`,
        }),
      );

      const mockQueryResult: QueryResult = {
        rows: Array(100).fill({ "?column?": 1 }),
        rowCount: 100,
        command: "INSERT",
        oid: 0,
        fields: [],
      };

      const dbError = new Error("Batch 2 failed");

      withDatabaseClientSpy.mockImplementation(async (fn: any) => {
        return fn(mockClient);
      });

      mockClient.query
        .mockResolvedValueOnce(mockQueryResult)
        .mockRejectedValueOnce(dbError);

      const result = await writer.writeSnapshots(snapshots);

      expect(result.success).toBe(false);
      expect(result.recordsInserted).toBe(100); // Only first batch succeeded
      expect(result.duplicatesSkipped).toBe(0);
      expect(result.errors).toEqual(["Batch 2 failed"]);

      // Both batches should have been attempted
      expect(withDatabaseClientSpy).toHaveBeenCalledTimes(2);
    });

    it("should aggregate multiple batch errors", async () => {
      const snapshots = Array.from({ length: 250 }, (_, i) =>
        createSnapshot({
          vault_address: `0x${i.toString().padStart(40, "0")}`,
        }),
      );

      withDatabaseClientSpy.mockImplementation(async (fn: any) => {
        return fn(mockClient);
      });

      mockClient.query
        .mockRejectedValueOnce(new Error("Batch 1 error"))
        .mockRejectedValueOnce(new Error("Batch 2 error"))
        .mockRejectedValueOnce(new Error("Batch 3 error"));

      const result = await writer.writeSnapshots(snapshots);

      expect(result.success).toBe(false);
      expect(result.recordsInserted).toBe(0);
      expect(result.errors).toEqual([
        "Batch 1 error",
        "Batch 2 error",
        "Batch 3 error",
      ]);
    });

    it("should handle null rowCount from database", async () => {
      const snapshots = Array.from({ length: 5 }, (_, i) =>
        createSnapshot({
          vault_address: `0x${i.toString().padStart(40, "0")}`,
        }),
      );

      const mockQueryResult: QueryResult = {
        rows: [],
        rowCount: null, // Database returns null
        command: "INSERT",
        oid: 0,
        fields: [],
      };

      withDatabaseClientSpy.mockImplementation(async (fn: any) => {
        return fn(mockClient);
      });

      mockClient.query.mockResolvedValue(mockQueryResult);

      const result = await writer.writeSnapshots(snapshots);

      expect(result.success).toBe(true);
      expect(result.recordsInserted).toBe(0); // Should handle null as 0
      expect(result.duplicatesSkipped).toBe(5); // All treated as duplicates
    });
  });

  describe("SQL Query Generation", () => {
    it("should generate parameterized query with all columns", async () => {
      const snapshot = createSnapshot();

      withDatabaseClientSpy.mockImplementation(async (fn: any) => {
        return fn(mockClient);
      });

      mockClient.query.mockResolvedValue({
        rows: [],
        rowCount: 1,
        command: "INSERT",
        oid: 0,
        fields: [],
      });

      await writer.writeSnapshots([snapshot]);

      const [sql, values] = mockClient.query.mock.calls[0];

      // Verify all columns are present
      const expectedColumns = [
        "source",
        "vault_address",
        "vault_name",
        "leader_address",
        "apr",
        "apr_base",
        "apr_reward",
        "tvl_usd",
        "total_followers",
        "leader_commission",
        "leader_fraction",
        "is_closed",
        "allow_deposits",
        "pool_meta",
        "raw_data",
        "snapshot_time",
      ];

      for (const column of expectedColumns) {
        expect(sql).toContain(column);
      }

      // Verify parameterized values
      expect(values).toEqual([
        "hyperliquid",
        "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303",
        "Test Vault",
        "0x677d8f50e9983013d4def386a1ac30c60e536f3a",
        0.1234,
        0.1,
        0.0234,
        1000000,
        50,
        0.05,
        0.15,
        false,
        true,
        { category: "vault" },
        { raw: "data" },
        "2024-01-01T00:00:00Z",
      ]);
    });

    it("should generate proper placeholders for multiple records", async () => {
      const snapshots = [
        createSnapshot({ vault_address: "0x0001" }),
        createSnapshot({ vault_address: "0x0002" }),
      ];

      withDatabaseClientSpy.mockImplementation(async (fn: any) => {
        return fn(mockClient);
      });

      mockClient.query.mockResolvedValue({
        rows: [],
        rowCount: 2,
        command: "INSERT",
        oid: 0,
        fields: [],
      });

      await writer.writeSnapshots(snapshots);

      const [sql, values] = mockClient.query.mock.calls[0];

      // Should have two value sets
      expect(sql).toMatch(/\(\$1, \$2, \$3.*\$16\)/); // First record
      expect(sql).toMatch(/\(\$17, \$18, \$19.*\$32\)/); // Second record

      expect(values).toHaveLength(32); // 2 records × 16 columns
    });

    it("should prevent SQL injection via parameterized queries", async () => {
      const maliciousSnapshot = createSnapshot({
        vault_address: "'; DROP TABLE hyperliquid_vault_apr_snapshots; --",
        vault_name: "<script>alert('xss')</script>",
      });

      withDatabaseClientSpy.mockImplementation(async (fn: any) => {
        return fn(mockClient);
      });

      mockClient.query.mockResolvedValue({
        rows: [],
        rowCount: 1,
        command: "INSERT",
        oid: 0,
        fields: [],
      });

      await writer.writeSnapshots([maliciousSnapshot]);

      const [sql, values] = mockClient.query.mock.calls[0];

      // SQL should only contain placeholders, not actual values
      expect(sql).not.toContain("DROP TABLE");
      expect(sql).not.toContain("<script>");

      // Values should be properly passed as parameters
      expect(values[1]).toBe(
        "'; DROP TABLE hyperliquid_vault_apr_snapshots; --",
      );
      expect(values[2]).toBe("<script>alert('xss')</script>");
    });
  });

  describe("Logging", () => {
    it("should log comprehensive processing information", async () => {
      const snapshots = Array.from({ length: 150 }, (_, i) =>
        createSnapshot({
          vault_address: `0x${i.toString().padStart(40, "0")}`,
        }),
      );

      const mockQueryResult1: QueryResult = {
        rows: Array(95).fill({ "?column?": 1 }),
        rowCount: 95, // 5 duplicates
        command: "INSERT",
        oid: 0,
        fields: [],
      };

      const mockQueryResult2: QueryResult = {
        rows: Array(48).fill({ "?column?": 1 }),
        rowCount: 48, // 2 duplicates
        command: "INSERT",
        oid: 0,
        fields: [],
      };

      withDatabaseClientSpy.mockImplementation(async (fn: any) => {
        return fn(mockClient);
      });

      mockClient.query
        .mockResolvedValueOnce(mockQueryResult1)
        .mockResolvedValueOnce(mockQueryResult2);

      await writer.writeSnapshots(snapshots);

      // Should log start
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Starting Hyperliquid vault APR snapshots write",
        {
          totalRecords: 150,
          batchSize: 100,
        },
      );

      // Should log completion
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Hyperliquid vault APR snapshots write completed",
        {
          totalRecords: 150,
          recordsInserted: 143,
          duplicatesSkipped: 7,
          errors: 0,
          success: true,
        },
      );

      // Should log each batch
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Processing Hyperliquid APR batch",
        { batchNumber: 1, batchSize: 100 },
      );

      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Hyperliquid APR batch written",
        { batchNumber: 1, recordsInserted: 95 },
      );
    });

    it("should not log when array is empty", async () => {
      await writer.writeSnapshots([]);

      expect(mockLogger.info).not.toHaveBeenCalled();
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });
  });

  describe("Data Integrity", () => {
    it("should handle null values correctly", async () => {
      const snapshot = createSnapshot({
        apr_base: null,
        apr_reward: null,
        tvl_usd: null,
        total_followers: null,
        leader_commission: null,
        leader_fraction: null,
        pool_meta: null,
        raw_data: null,
      });

      withDatabaseClientSpy.mockImplementation(async (fn: any) => {
        return fn(mockClient);
      });

      mockClient.query.mockResolvedValue({
        rows: [],
        rowCount: 1,
        command: "INSERT",
        oid: 0,
        fields: [],
      });

      await writer.writeSnapshots([snapshot]);

      const [, values] = mockClient.query.mock.calls[0];

      expect(values[5]).toBeNull(); // apr_base
      expect(values[6]).toBeNull(); // apr_reward
      expect(values[7]).toBeNull(); // tvl_usd
      expect(values[8]).toBeNull(); // total_followers
      expect(values[13]).toBeNull(); // pool_meta
      expect(values[14]).toBeNull(); // raw_data
    });

    it("should preserve boolean false values", async () => {
      const snapshot = createSnapshot({
        is_closed: false,
        allow_deposits: false,
      });

      withDatabaseClientSpy.mockImplementation(async (fn: any) => {
        return fn(mockClient);
      });

      mockClient.query.mockResolvedValue({
        rows: [],
        rowCount: 1,
        command: "INSERT",
        oid: 0,
        fields: [],
      });

      await writer.writeSnapshots([snapshot]);

      const [, values] = mockClient.query.mock.calls[0];

      expect(values[11]).toBe(false); // is_closed
      expect(values[12]).toBe(false); // allow_deposits
    });

    it("should preserve decimal precision in APR values", async () => {
      const snapshot = createSnapshot({
        apr: 0.123456789,
        apr_base: 0.987654321,
        apr_reward: 0.00000001,
      });

      withDatabaseClientSpy.mockImplementation(async (fn: any) => {
        return fn(mockClient);
      });

      mockClient.query.mockResolvedValue({
        rows: [],
        rowCount: 1,
        command: "INSERT",
        oid: 0,
        fields: [],
      });

      await writer.writeSnapshots([snapshot]);

      const [, values] = mockClient.query.mock.calls[0];

      expect(values[4]).toBe(0.123456789); // apr
      expect(values[5]).toBe(0.987654321); // apr_base
      expect(values[6]).toBe(0.00000001); // apr_reward
    });
  });
});
