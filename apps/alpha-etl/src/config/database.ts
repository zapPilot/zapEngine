import { Pool, type PoolClient } from "pg";
import { logger } from "../utils/logger.js";
import { sleep } from "../utils/sleep.js";
import { env } from "./environment.js";
export {
  RATE_LIMITS,
  TIMEOUTS,
  APR_VALIDATION,
  TIME_CONSTANTS,
  DATA_LIMITS,
  MV_REFRESH_CONFIG,
} from "./constants.js";
export type { MVConfig } from "./constants.js";

// ============================================================================
// Table Definitions (consolidated from tables.ts)
// ============================================================================

/**
 * Centralized database table name definitions to avoid scattered schema references
 */
export const TABLES = {
  POOL_APR_SNAPSHOTS: `${env.DB_SCHEMA}.pool_apr_snapshots`,
  WALLET_TOKEN_SNAPSHOTS: `${env.DB_SCHEMA}.wallet_token_snapshots`,
  HYPERLIQUID_VAULT_APR_SNAPSHOTS: `${env.DB_SCHEMA}.hyperliquid_vault_apr_snapshots`,
  PORTFOLIO_ITEM_SNAPSHOTS: "public.portfolio_item_snapshots",
  SENTIMENT_SNAPSHOTS: `${env.DB_SCHEMA}.sentiment_snapshots`,
  TOKEN_PRICE_SNAPSHOTS: `${env.DB_SCHEMA}.token_price_snapshots`,
  TOKEN_PRICE_DMA_SNAPSHOTS: `${env.DB_SCHEMA}.token_price_dma_snapshots`,
  TOKEN_PAIR_RATIO_DMA_SNAPSHOTS: `${env.DB_SCHEMA}.token_pair_ratio_dma_snapshots`,
} as const;

/**
 * Type-safe table name getter to ensure consistency across the application
 */
export type TableName = keyof typeof TABLES;

/**
 * Get fully qualified table name with schema prefix
 */
export function getTableName(table: TableName): string {
  return TABLES[table];
}

// ============================================================================
// Database Pool Management
// ============================================================================

let pool: Pool | null = null;
let mockPool: Pool | null = null;

const isPoolMocked =
  typeof (Pool as unknown as { mock?: unknown }).mock !== "undefined";
const shouldUseMockPool =
  env.NODE_ENV === "test" &&
  process.env.MOCK_APIS?.toLowerCase() === "true" &&
  !isPoolMocked;

const mockVipUsersWithActivity = [
  {
    user_id: "user-1",
    wallet: "0x1111111111111111111111111111111111111111",
    last_activity_at: "2025-01-01T00:00:00.000Z",
    last_portfolio_update_at: "2025-01-02T00:00:00.000Z",
  },
  {
    user_id: "user-2",
    wallet: "0x2222222222222222222222222222222222222222",
    last_activity_at: null,
    last_portfolio_update_at: null,
  },
];

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

function getConnectionRetryDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 5000);
}

function releaseClient(client: PoolClient | null): void {
  client?.release();
}

async function runMockQuery(
  query: string,
  params?: unknown[],
): Promise<{ rows: Array<Record<string, unknown>>; rowCount: number }> {
  const normalized = normalizeSql(query);

  if (normalized.includes("get_users_wallets_by_plan_with_activity")) {
    if (normalized.includes("count(*) as total_rows")) {
      const totalRows = mockVipUsersWithActivity.length;
      const uniqueWallets = new Set(
        mockVipUsersWithActivity.map((row) => row.wallet),
      ).size;
      return {
        rows: [
          {
            total_rows: String(totalRows),
            unique_wallets: String(uniqueWallets),
            duplicate_count: String(totalRows - uniqueWallets),
          },
        ],
        rowCount: 1,
      };
    }

    /* c8 ignore start */
    if (
      normalized.includes("select wallet") &&
      normalized.includes("where user_id = $1")
    ) {
      const userId = params?.[0];
      const rows = mockVipUsersWithActivity
        .filter((row) => row.user_id === userId)
        .map((row) => ({ wallet: row.wallet }));
      return { rows, rowCount: rows.length };
    }
    /* c8 ignore end */

    return {
      rows: mockVipUsersWithActivity,
      rowCount: mockVipUsersWithActivity.length,
    };
  }

  /* c8 ignore start */
  if (normalized.includes("get_users_wallets_by_plan")) {
    const rows = mockVipUsersWithActivity.map((row) => ({
      user_id: row.user_id,
      wallet: row.wallet,
    }));
    return { rows, rowCount: rows.length };
  }

  if (normalized.includes("get_users_wallets_by_ids")) {
    const firstParam = params?.[0];
    const ids = Array.isArray(firstParam) ? (firstParam as string[]) : [];
    const rows = mockVipUsersWithActivity
      .filter((row) => ids.includes(row.user_id))
      .map((row) => ({ user_id: row.user_id, wallet: row.wallet }));
    return { rows, rowCount: rows.length };
  }

  if (
    normalized.includes("from users u") &&
    normalized.includes("user_subscriptions")
  ) {
    return { rows: [], rowCount: 0 };
  }

  return { rows: [], rowCount: 0 };
  /* c8 ignore end */
}

function createMockPool(): Pool {
  const client = {
    query: async (sql: string, params?: unknown[]) => runMockQuery(sql, params),
    release: () => {},
  };

  return {
    query: async (sql: string, params?: unknown[]) => runMockQuery(sql, params),
    connect: async () => client,
    end: async () => {},
    on: () => {},
  } as unknown as Pool;
}

export function createDbPool(): Pool {
  if (shouldUseMockPool) {
    if (!mockPool) {
      mockPool = createMockPool();
    }
    return mockPool;
  }
  if (pool) {
    return pool;
  }

  try {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 40, // Maximum number of clients in the pool (increased for concurrent API + poller)
      idleTimeoutMillis: 60000, // Close idle clients after 60 seconds (matches polling + processing time)
      connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established (reasonable for cloud DBs)
      ssl:
        env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    });

    pool.on("error", (err) => {
      logger.error("Unexpected error on idle client:", err);
    });

    logger.info("Database pool initialized successfully");
    return pool;
  } catch (error) {
    logger.error("Failed to initialize database pool:", error);
    throw error;
  }
}

export function getDbPool(): Pool {
  if (!pool) {
    return createDbPool();
  }
  return pool;
}

export async function getDbClient(retries = 3): Promise<PoolClient> {
  const dbPool = getDbPool();

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await dbPool.connect();
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }

      const delay = getConnectionRetryDelay(attempt);
      logger.warn(
        `Connection attempt ${attempt} failed, retrying in ${delay}ms`,
        { error },
      );
      await sleep(delay);
    }
  }

  throw new Error("Failed to acquire database connection after retries");
}

export async function testDatabaseConnection(): Promise<boolean> {
  let client: PoolClient | null = null;
  try {
    client = await getDbClient();
    const result = await client.query(
      `SELECT COUNT(*) FROM ${getTableName("POOL_APR_SNAPSHOTS")}`,
    );

    logger.info("Database connection test successful", {
      schema: env.DB_SCHEMA,
      result: result.rows[0],
    });
    return true;
  } catch (error) {
    logger.error("Database connection test failed:", error);
    return false;
  } finally {
    releaseClient(client);
  }
}

export async function pingDatabase(): Promise<boolean> {
  let client: PoolClient | null = null;
  try {
    client = await getDbClient();
    await client.query("SELECT 1");
    return true;
  } catch (error) {
    logger.error("Database ping failed:", error);
    return false;
  } finally {
    releaseClient(client);
  }
}

export async function closeDbPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info("Database pool closed");
  }
}
