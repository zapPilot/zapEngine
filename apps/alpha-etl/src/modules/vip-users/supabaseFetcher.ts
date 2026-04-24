import { BaseDatabaseClient } from '../../core/database/baseDatabaseClient.js';
import type { VipUser, VipUserWithActivity } from '../../types/index.js';
import { APIError, toErrorMessage } from '../../utils/errors.js';
import { wrapHealthCheck } from '../../utils/healthCheck.js';
import { logger } from '../../utils/logger.js';

/**
 * Database-backed VIP user fetcher.
 *
 * Provides wallet/user lookups and activity-aware variants using SQL functions,
 * plus lightweight request statistics for processor health/status reporting.
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
   * Fetch VIP users and their wallets from Supabase
   * Uses the stored procedure: get_users_wallets_by_plan('vip')
   */
  async fetchVipUsers(): Promise<VipUser[]> {
    try {
      this.recordRequest();

      logger.info('Fetching VIP users from database via DATABASE_URL');

      const valid = await this.fetchValidatedVipUsersRows(
        'select user_id, wallet from public.get_users_wallets_by_plan($1)',
        ['vip'],
      );
      logger.info('VIP users fetched successfully', {
        userCount: valid.length,
      });
      return this.normalizeUsersWithWallet(valid);
    } catch (error) {
      logger.error('Failed to fetch VIP users from database:', { error });
      return this.handleFetchError(error, 'DB fetch failed');
    }
  }

  /**
   * Fetch VIP users with activity tracking timestamps
   * Uses the stored procedure: get_users_wallets_by_plan_with_activity('vip')
   * Returns all VIP users with their last_activity_at and last_portfolio_update_at timestamps
   */
  async fetchVipUsersWithActivity(): Promise<VipUserWithActivity[]> {
    try {
      this.recordRequest();

      logger.info('Fetching VIP users with activity data from database');

      // Call the stored procedure: get_users_wallets_by_plan_with_activity(plan_name text)
      const rows = await this.fetchRows<{
        user_id: string;
        wallet: string;
        last_activity_at: string | null;
        last_portfolio_update_at: string | null;
      }>(
        'select user_id, wallet, last_activity_at, last_portfolio_update_at from public.get_users_wallets_by_plan_with_activity($1)',
        ['vip'],
      );

      const valid = this.filterValidVipRows(rows);
      const normalizedUsers = this.normalizeUsersWithWallet(valid);
      const uniqueUsers = this.dedupeByWallet(normalizedUsers);

      if (uniqueUsers.length < valid.length) {
        logger.warn('Duplicate wallets detected after SQL query', {
          total: valid.length,
          unique: uniqueUsers.length,
          duplicates: valid.length - uniqueUsers.length,
        });
      }

      logger.info(
        'VIP users with activity fetched successfully',
        this.buildActivityFetchSummary(uniqueUsers),
      );

      return uniqueUsers;
    } catch (error) {
      logger.error('Failed to fetch VIP users with activity from database:', {
        error,
      });
      return this.handleFetchError(error, 'DB fetch with activity failed');
    }
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

  /**
   * Fetch specific users by their IDs (for testing or partial updates)
   */
  async fetchUsersByIds(
    userIds: string[] | null | undefined,
  ): Promise<VipUser[]> {
    if (!userIds?.length) {
      return [];
    }

    try {
      this.recordRequest();
      logger.info('Fetching specific users from database', {
        userCount: userIds.length,
      });

      const valid = await this.fetchValidatedVipUsersRows(
        'select user_id, wallet from public.get_users_wallets_by_ids($1)',
        [userIds],
      );

      logger.info('Specific users fetched successfully', {
        requested: userIds.length,
        found: valid.length,
      });
      return this.normalizeUsersWithWallet(valid);
    } catch (error) {
      logger.error('Failed to fetch users by IDs from database:', {
        error,
        userIds,
      });
      return this.handleFetchError(error, 'DB fetch by IDs failed');
    }
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details?: string;
  }> {
    return wrapHealthCheck(async () => {
      const result = await this.withDatabaseClient(async (client) => {
        // Check DB connectivity and whether expected function exists
        const ping = await client.query('select 1 as ok');
        const fn = await client.query<{ exists: boolean }>(
          "select exists (select 1 from pg_proc where proname = 'get_users_wallets_by_plan') as exists",
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
          details: 'Function get_users_wallets_by_plan not found',
        };
      }

      return { status: 'healthy' };
    });
  }

  private isValidVipUser(row: unknown): row is VipUser {
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

  private async fetchValidatedVipUsersRows(
    query: string,
    params: unknown[],
  ): Promise<VipUser[]> {
    // Call the stored procedure and keep only records with required user_id/wallet fields.
    const rows = await this.fetchRows<{ user_id: string; wallet: string }>(
      query,
      params,
    );
    return this.filterValidVipRows(rows);
  }

  private async fetchRows<T extends Record<string, unknown>>(
    query: string,
    params: unknown[],
  ): Promise<T[]> {
    return this.withDatabaseClient(async (client) => {
      const { rows } = await client.query(query, params);
      return rows as T[];
    });
  }

  private filterValidVipRows<T>(rows: T[]): T[] {
    const validRows = rows.filter((row) => this.isValidVipUser(row));
    this.logInvalidVipRows(rows.length, validRows.length);
    return validRows;
  }

  private logInvalidVipRows(totalRows: number, validRows: number): void {
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

  private buildActivityFetchSummary(users: VipUserWithActivity[]): {
    userCount: number;
    withActivity: number;
    withPortfolioUpdate: number;
  } {
    return {
      userCount: users.length,
      withActivity: users.filter((user) => user.last_activity_at).length,
      withPortfolioUpdate: users.filter((user) => user.last_portfolio_update_at)
        .length,
    };
  }

  private normalizeUsersWithWallet<T extends { wallet: string }>(
    users: T[],
  ): T[] {
    return users.map((user) => ({
      ...user,
      wallet: this.normalizeWalletAddress(user.wallet),
    }));
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
