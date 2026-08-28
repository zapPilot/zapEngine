import { sleep } from '@zapengine/types/shared';
import { Pool, type PoolClient } from 'pg';

import { captureBackgroundException } from '../observability/sentry.js';
import { logger } from '../utils/logger.js';
import { env } from './environment.js';

// ============================================================================
// Table Definitions (consolidated from tables.ts)
// ============================================================================

/**
 * Centralized database table name definitions to avoid scattered schema references
 */
export const TABLES = {
  DAILY_WALLET_TOKENS: 'analytics.daily_wallet_tokens',
  HYPERLIQUID_VAULT_APR_SNAPSHOTS: `${env.DB_SCHEMA}.hyperliquid_vault_apr_snapshots`,
  DAILY_PORTFOLIO_POSITIONS: 'analytics.daily_portfolio_positions',
  SENTIMENT_SNAPSHOTS: `${env.DB_SCHEMA}.sentiment_snapshots`,
  MACRO_FEAR_GREED_SNAPSHOTS: `${env.DB_SCHEMA}.macro_fear_greed_snapshots`,
  TOKEN_PRICE_SNAPSHOTS: `${env.DB_SCHEMA}.token_price_snapshots`,
  TOKEN_PRICE_DMA_SNAPSHOTS: `${env.DB_SCHEMA}.token_price_dma_snapshots`,
  TOKEN_PAIR_RATIO_DMA_SNAPSHOTS: `${env.DB_SCHEMA}.token_pair_ratio_dma_snapshots`,
  STOCK_PRICE_SNAPSHOTS: `${env.DB_SCHEMA}.stock_price_snapshots`,
  STOCK_PRICE_DMA_SNAPSHOTS: `${env.DB_SCHEMA}.stock_price_dma_snapshots`,
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
  typeof (Pool as unknown as { mock?: unknown }).mock !== 'undefined';
const shouldUseMockPool =
  env.NODE_ENV === 'test' &&
  process.env['MOCK_APIS']?.toLowerCase() === 'true' &&
  !isPoolMocked;

const mockUserServiceStates = [
  {
    user_id: '11111111-1111-1111-1111-111111111111',
    email: 'priority@example.com',
    wallet: '0x1111111111111111111111111111111111111111',
    plan_code: 'vip',
    last_activity_at: '2025-01-01T00:00:00.000Z',
    last_portfolio_update_at: null,
    default_tier: 'priority',
    override_tier: null,
    override_reason: null,
    override_expires_at: null,
    effective_tier: 'priority',
    refresh_interval_hours: 24,
    due_for_refresh: true,
    aum_usd: '12500.00',
  },
  {
    user_id: '22222222-2222-2222-2222-222222222222',
    email: 'standard@example.com',
    wallet: '0x2222222222222222222222222222222222222222',
    plan_code: 'free',
    last_activity_at: null,
    last_portfolio_update_at: null,
    default_tier: 'standard',
    override_tier: null,
    override_reason: null,
    override_expires_at: null,
    effective_tier: 'standard',
    refresh_interval_hours: null,
    due_for_refresh: false,
    aum_usd: null,
  },
];

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function getConnectionRetryDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 5000);
}

function releaseClient(client: PoolClient | null): void {
  client?.release();
}

async function runMockQuery(
  query: string,
): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> {
  const normalized = normalizeSql(query);

  if (normalized.includes('ops_record_user_resource_usage')) {
    return { rows: [], rowCount: 0 };
  }

  if (normalized.includes('get_user_service_states')) {
    if (normalized.includes('count(*) as total_rows')) {
      const totalRows = mockUserServiceStates.length;
      const uniqueWallets = new Set(
        mockUserServiceStates.map((row) => row.wallet),
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

    return {
      rows: mockUserServiceStates,
      rowCount: mockUserServiceStates.length,
    };
  }

  /* c8 ignore start */
  return { rows: [], rowCount: 0 };
  /* c8 ignore end */
}

function createMockPool(): Pool {
  const client = {
    query: async (sql: string) => runMockQuery(sql),
    release: () => {},
  };

  return {
    query: async (sql: string) => runMockQuery(sql),
    connect: async () => client,
    end: async () => {},
    on: () => {},
  } as unknown as Pool;
}

export function createDbPool(): Pool {
  if (shouldUseMockPool) {
    mockPool ??= createMockPool();
    return mockPool;
  }
  if (pool) {
    return pool;
  }

  try {
    pool = new Pool({
      connectionString: env.ALPHA_ETL_DATABASE_URL,
      max: 40, // Maximum number of clients in the pool (increased for concurrent API + poller)
      idleTimeoutMillis: 60000, // Close idle clients after 60 seconds (matches polling + processing time)
      connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection could not be established (reasonable for cloud DBs)
      ssl:
        env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });

    pool.on('error', (err) => {
      logger.error('Unexpected error on idle client:', err);
    });

    logger.info('Database pool initialized successfully');
    return pool;
  } catch (error) {
    logger.error('Failed to initialize database pool:', error);
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

  throw new Error('Failed to acquire database connection after retries');
}

export async function testDatabaseConnection(): Promise<boolean> {
  let client: PoolClient | null = null;
  try {
    client = await getDbClient();
    const result = await client.query('SELECT 1 AS ok');

    logger.info('Database connection test successful', {
      schema: env.DB_SCHEMA,
      result: result.rows[0],
    });
    return true;
  } catch (error) {
    logger.error('Database connection test failed:', error);
    return false;
  } finally {
    releaseClient(client);
  }
}

// Tracks consecutive pingDatabase failures across the health monitor's
// 15-second poll loop. An unconditional capture on every tick would be
// ~240 events/hour; only the first failure of a run is reported.
let consecutivePingFailures = 0;

export async function pingDatabase(): Promise<boolean> {
  let client: PoolClient | null = null;
  try {
    client = await getDbClient();
    await client.query('SELECT 1');
    consecutivePingFailures = 0;
    return true;
  } catch (error) {
    logger.error('Database ping failed:', error);
    consecutivePingFailures += 1;
    if (consecutivePingFailures === 1) {
      captureBackgroundException(error, {
        component: 'db-health',
        context: { consecutiveFailures: consecutivePingFailures },
        level: 'warning',
      });
    }
    return false;
  } finally {
    releaseClient(client);
  }
}

export async function closeDbPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database pool closed');
  }
}
