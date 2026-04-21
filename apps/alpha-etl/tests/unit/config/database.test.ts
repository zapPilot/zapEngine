import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { Pool } from "pg";

// Mock pg module
vi.mock("pg", () => ({
  Pool: vi.fn(),
}));

// Mock dependencies
vi.mock("../../../src/config/environment.js", () => ({
  env: {
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    NODE_ENV: "test",
    DB_SCHEMA: "public",
  },
}));

vi.mock("../../../src/utils/logger.js", async () => {
  const { mockLogger } = await import("../../setup/mocks.js");
  return mockLogger();
});

describe("Database Configuration", () => {
  let mockPool: unknown;
  let mockClient: unknown;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Clear any existing pool
    const { closeDbPool } = await import("../../../src/config/database.js");
    await closeDbPool();

    // Setup mocks
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };

    mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
      on: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
    };

    (Pool as unknown).mockImplementation(() => {
      return mockPool;
    });
  });

  afterEach(async () => {
    const { closeDbPool } = await import("../../../src/config/database.js");
    await closeDbPool();
  });

  describe("Pool Creation", () => {
    it("should create a database pool with correct configuration", async () => {
      const { createDbPool } = await import("../../../src/config/database.js");

      const pool = createDbPool();

      expect(Pool).toHaveBeenCalledWith({
        connectionString: "postgresql://test:test@localhost:5432/test",
        max: 40,
        idleTimeoutMillis: 60000,
        connectionTimeoutMillis: 10000,
        ssl: false,
      });
      expect(pool).toBe(mockPool);
    });

    it("should return existing pool if already created", async () => {
      const { createDbPool } = await import("../../../src/config/database.js");

      const pool1 = createDbPool();
      const pool2 = createDbPool();

      expect(pool1).toBe(pool2);
      expect(Pool).toHaveBeenCalledTimes(1);
    });
  });

  describe("Database Connection Test", () => {
    it("should return true for successful connection test", async () => {
      const { testDatabaseConnection } =
        await import("../../../src/config/database.js");

      mockClient.query.mockResolvedValue({
        rows: [{ count: "5" }],
      });

      const result = await testDatabaseConnection();

      expect(result).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith(
        "SELECT COUNT(*) FROM public.pool_apr_snapshots",
      );
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("should return false for failed connection test", async () => {
      const { testDatabaseConnection } =
        await import("../../../src/config/database.js");

      mockPool.connect.mockRejectedValue(new Error("Connection failed"));

      const result = await testDatabaseConnection();

      expect(result).toBe(false);
    });

    it("should release client even if query fails", async () => {
      const { testDatabaseConnection } =
        await import("../../../src/config/database.js");

      mockClient.query.mockRejectedValue(new Error("Query failed"));

      await testDatabaseConnection();

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe("pingDatabase", () => {
    it("should return true when ping succeeds", async () => {
      const { pingDatabase } = await import("../../../src/config/database.js");

      mockClient.query.mockResolvedValue({ rows: [] });

      const result = await pingDatabase();

      expect(result).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith("SELECT 1");
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("should return false when ping fails", async () => {
      const { pingDatabase } = await import("../../../src/config/database.js");

      mockClient.query.mockRejectedValue(new Error("ping failed"));

      const result = await pingDatabase();

      expect(result).toBe(false);
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe("Pool Management", () => {
    it("should get database client from pool", async () => {
      const { getDbClient } = await import("../../../src/config/database.js");

      const client = await getDbClient();

      expect(client).toBe(mockClient);
      expect(mockPool.connect).toHaveBeenCalled();
    });

    it("should close database pool", async () => {
      const { createDbPool, closeDbPool } =
        await import("../../../src/config/database.js");

      createDbPool(); // Create pool first
      await closeDbPool();

      expect(mockPool.end).toHaveBeenCalled();
    });

    it("should surface initialization errors", async () => {
      (Pool as unknown).mockImplementationOnce(() => {
        throw new Error("init failed");
      });

      const { createDbPool } = await import("../../../src/config/database.js");

      expect(() => createDbPool()).toThrow("init failed");
    });
  });
});
