import { BaseDatabaseClient } from '../../core/database/baseDatabaseClient.js';
import type { ETLUserCandidate, ServiceTier } from '../../types/index.js';
import { APIError, toErrorMessage } from '../../utils/errors.js';
import {
  createWrappedHealthCheck,
  type HealthCheckResult,
} from '../../utils/healthCheck.js';
import { logger } from '../../utils/logger.js';
import type { UserResourceUsageRow } from './attribution.js';
import type { WalletSourceRefreshRow } from './refreshState.js';

/**
 * One row of `public.get_user_service_states()`, in the shape Postgres returns
 * it. The ETL reads only the scheduling answer; `email`, the override reason
 * and `aum_usd` are selected because the Control Center reads the same
 * function, and a projection that diverged between the two readers is exactly
 * the drift the single-source-of-truth function exists to prevent.
 *
 * `source_states` and `wallet_created_at` are left out: they exist for the
 * Control Center's reporting, and the explicit column list is what makes a
 * column the function drops fail here loudly instead of arriving as undefined.
 */
interface UserServiceStateRow {
  user_id: string;
  email: string | null;
  wallet: string;
  plan_code: string;
  last_activity_at: string | null;
  last_portfolio_update_at: string | null;
  default_tier: ServiceTier;
  override_tier: ServiceTier | null;
  override_reason: string | null;
  override_expires_at: string | null;
  effective_tier: ServiceTier;
  refresh_interval_hours: number | null;
  due_for_refresh: boolean;
  aum_usd: string | null;
  due_sources: string[] | null;
}

const USER_SERVICE_STATES_QUERY =
  'select user_id, email, wallet, plan_code, last_activity_at, last_portfolio_update_at, default_tier, override_tier, override_reason, override_expires_at, effective_tier, refresh_interval_hours, due_for_refresh, aum_usd, due_sources from public.get_user_service_states()';

const RECORD_RESOURCE_USAGE_QUERY =
  'select public.ops_record_user_resource_usage($1::jsonb)';

const RECORD_WALLET_SOURCE_REFRESH_QUERY =
  'select public.ops_record_wallet_source_refresh($1::jsonb)';

/**
 * Database-backed reader for per-wallet service policy, and writer of what
 * serving those wallets costs.
 *
 * The service-state read and the usage write both go through `public` definer
 * functions: `alpha_etl_user` connects as itself over raw pg and holds no
 * privilege on the `ops` schema those functions reach.
 */
export class SupabaseFetcher extends BaseDatabaseClient {
  // Keep a trivial stats shape for compatibility with processor getStats methods
  private requestCount = 0;
  private lastRequestTime = 0;

  public getRequestStats(): { requestCount: number; lastRequestTime: number } {
    return {
      requestCount: this.requestCount,
      lastRequestTime: this.lastRequestTime,
    };
  }

  private recordRequest(): void {
    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  private normalizeWalletAddress(wallet: string): string {
    return wallet.toLowerCase();
  }

  /**
   * Fetch every ownership-verified wallet with its resolved service policy.
   *
   * Returns free-plan wallets too: they are visible to operations reporting
   * but carry `dueForRefresh: false`, so scheduling stays the SQL function's
   * decision rather than a filter this class could disagree with.
   */
  async fetchUserServiceStates(): Promise<ETLUserCandidate[]> {
    try {
      this.recordRequest();

      logger.info('Fetching user service states from database');

      const rows = await this.fetchRows<UserServiceStateRow>(
        USER_SERVICE_STATES_QUERY,
      );
      const valid = this.filterValidRows(rows);
      const candidates = this.dedupeByWallet(
        valid.map((row) => this.toCandidate(row)),
      );

      if (candidates.length < valid.length) {
        logger.warn('Duplicate wallets detected after SQL query', {
          total: valid.length,
          unique: candidates.length,
          duplicates: valid.length - candidates.length,
        });
      }

      logger.info(
        'User service states fetched successfully',
        this.buildFetchSummary(candidates),
      );

      return candidates;
    } catch (error) {
      logger.error('Failed to fetch user service states from database:', {
        error,
      });
      return this.handleFetchError(error, 'DB fetch of service states failed');
    }
  }

  /**
   * Append per-user provider request counts to the usage ledger.
   *
   * Rows travel as one jsonb payload because the definer function unpacks them
   * with `jsonb_to_recordset`: a per-row round trip would multiply a daily
   * batch's statement count by its wallet count for a write nobody waits on.
   */
  async recordUserResourceUsage(rows: UserResourceUsageRow[]): Promise<void> {
    await this.withDatabaseClient(async (client) => {
      await client.query(RECORD_RESOURCE_USAGE_QUERY, [JSON.stringify(rows)]);
    });
  }

  /**
   * Replace the recorded refresh state for each (wallet, source) pair.
   *
   * Throws on failure. Recording state is bookkeeping nothing waits on, but
   * whether that is fatal is the caller's decision — the pipelines wrap this
   * in `recordSourceRefreshOutcomeNonFatal`, and a swallow here would hide the
   * failure from a caller that did want to know.
   */
  async recordWalletSourceRefresh(
    rows: WalletSourceRefreshRow[],
  ): Promise<void> {
    await this.withDatabaseClient(async (client) => {
      await client.query(RECORD_WALLET_SOURCE_REFRESH_QUERY, [
        JSON.stringify(rows),
      ]);
    });
  }

  /**
   * Batch update portfolio timestamps for multiple wallets
   * Updates user_crypto_wallets.last_portfolio_update_at to current timestamp
   *
   * @param wallets - Array of wallet addresses to update
   */
  async batchUpdatePortfolioTimestamps(
    wallets: string[] | null | undefined,
  ): Promise<void> {
    if (!wallets?.length) {
      logger.debug('No wallets to update timestamps for');
      return;
    }

    try {
      logger.debug('Updating portfolio timestamps for wallets', {
        count: wallets.length,
      });

      await this.withDatabaseClient(async (client) => {
        // Batch update all wallets at once using ANY
        // Use LOWER() for case-insensitive comparison since DB stores checksum-case wallets
        // but the ETL normalizes wallets to lowercase for consistent handling
        const { rowCount } = await client.query(
          'UPDATE user_crypto_wallets SET last_portfolio_update_at = NOW() WHERE LOWER(wallet) = ANY($1)',
          [wallets],
        );

        logger.info('Portfolio timestamps updated', {
          walletsRequested: wallets.length,
          rowsUpdated: rowCount ?? 0,
        });
      });
    } catch (error) {
      // Log error but don't throw - timestamp update failure is non-fatal
      logger.error('Failed to update portfolio timestamps', {
        error,
        walletCount: wallets.length,
      });
    }
  }

  healthCheck = createWrappedHealthCheck(() => this.checkHealth());

  private async checkHealth(): Promise<HealthCheckResult> {
    const result = await this.withDatabaseClient(async (client) => {
      // Check DB connectivity and whether expected function exists
      const ping = await client.query('select 1 as ok');
      const fn = await client.query<{ exists: boolean }>(
        "select exists (select 1 from pg_proc where proname = 'get_user_service_states') as exists",
      );
      return {
        ok: ping.rows[0]?.ok === 1,
        hasFn: fn.rows[0]?.exists === true,
      };
    });

    if (!result.ok) {
      return { status: 'unhealthy', details: 'DB ping failed' };
    }

    if (!result.hasFn) {
      return {
        status: 'unhealthy',
        details: 'Function get_user_service_states not found',
      };
    }

    return { status: 'healthy' };
  }

  private toCandidate(row: UserServiceStateRow): ETLUserCandidate {
    return {
      userId: row.user_id,
      wallet: this.normalizeWalletAddress(row.wallet),
      planCode: row.plan_code,
      defaultTier: row.default_tier,
      overrideTier: row.override_tier,
      effectiveTier: row.effective_tier,
      lastActivityAt: row.last_activity_at,
      lastPortfolioUpdateAt: row.last_portfolio_update_at,
      refreshIntervalHours: row.refresh_interval_hours,
      dueForRefresh: row.due_for_refresh,
      dueSources: row.due_sources ?? [],
    };
  }

  private isValidRow(row: unknown): row is UserServiceStateRow {
    const candidate = row as
      | { user_id?: unknown; wallet?: unknown }
      | null
      | undefined;
    return (
      typeof candidate?.user_id === 'string' &&
      candidate.user_id.length > 0 &&
      typeof candidate.wallet === 'string' &&
      candidate.wallet.length > 0
    );
  }

  private async fetchRows<T>(query: string): Promise<T[]> {
    return this.withDatabaseClient(async (client) => {
      const { rows } = await client.query(query);
      return rows as T[];
    });
  }

  private filterValidRows<T>(rows: T[]): T[] {
    const validRows = rows.filter((row) => this.isValidRow(row));
    this.logInvalidRows(rows.length, validRows.length);
    return validRows;
  }

  private logInvalidRows(totalRows: number, validRows: number): void {
    if (validRows === totalRows) {
      return;
    }

    logger.warn('Some invalid user records filtered out', {
      total: totalRows,
      valid: validRows,
      invalid: totalRows - validRows,
    });
  }

  private dedupeByWallet<T extends { wallet: string }>(users: T[]): T[] {
    return Array.from(
      new Map(users.map((user) => [user.wallet, user])).values(),
    );
  }

  private buildFetchSummary(candidates: ETLUserCandidate[]): {
    walletCount: number;
    priority: number;
    dueForRefresh: number;
  } {
    return {
      walletCount: candidates.length,
      priority: candidates.filter(
        (candidate) => candidate.effectiveTier === 'priority',
      ).length,
      dueForRefresh: candidates.filter((candidate) => candidate.dueForRefresh)
        .length,
    };
  }

  private throwDatabaseFetchError(error: unknown, prefix: string): never {
    throw new APIError(
      `${prefix}: ${toErrorMessage(error)}`,
      500,
      'db',
      'SupabaseFetcher',
    );
  }

  private handleFetchError(error: unknown, prefix: string): never {
    if (error instanceof APIError) {
      throw error;
    }

    this.throwDatabaseFetchError(error, prefix);
  }
}
