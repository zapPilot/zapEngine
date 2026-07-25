import type { PoolClient, QueryResultRow } from 'pg';

import { getDbClient } from '../../config/database.js';
import { toErrorMessage } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

const PROCESS_PORTFOLIO_ROLLUP_QUEUE_SQL = `
  SELECT
    portfolio_keys_processed AS "portfolioKeysProcessed",
    wallet_keys_processed AS "walletKeysProcessed",
    users_processed AS "usersProcessed",
    portfolio_rows_written AS "portfolioRowsWritten",
    wallet_rows_written AS "walletRowsWritten",
    trend_rows_written AS "trendRowsWritten",
    remaining_portfolio_keys AS "remainingPortfolioKeys",
    remaining_wallet_keys AS "remainingWalletKeys",
    remaining_users AS "remainingUsers"
  FROM private.process_portfolio_rollup_queue()
`;

interface PortfolioRollupRow extends QueryResultRow {
  portfolioKeysProcessed: string | number;
  walletKeysProcessed: string | number;
  usersProcessed: string | number;
  portfolioRowsWritten: string | number;
  walletRowsWritten: string | number;
  trendRowsWritten: string | number;
  remainingPortfolioKeys: string | number;
  remainingWalletKeys: string | number;
  remainingUsers: string | number;
}

export interface PortfolioRollupMetrics {
  portfolioKeysProcessed: number;
  walletKeysProcessed: number;
  usersProcessed: number;
  portfolioRowsWritten: number;
  walletRowsWritten: number;
  trendRowsWritten: number;
  remainingPortfolioKeys: number;
  remainingWalletKeys: number;
  remainingUsers: number;
}

export interface PortfolioRollupSyncStats {
  durationMs: number;
  metrics: PortfolioRollupMetrics;
}

function parseMetric(value: string | number): number {
  return typeof value === 'number' ? value : Number.parseInt(value, 10);
}

function parseMetrics(row: PortfolioRollupRow): PortfolioRollupMetrics {
  return {
    portfolioKeysProcessed: parseMetric(row.portfolioKeysProcessed),
    walletKeysProcessed: parseMetric(row.walletKeysProcessed),
    usersProcessed: parseMetric(row.usersProcessed),
    portfolioRowsWritten: parseMetric(row.portfolioRowsWritten),
    walletRowsWritten: parseMetric(row.walletRowsWritten),
    trendRowsWritten: parseMetric(row.trendRowsWritten),
    remainingPortfolioKeys: parseMetric(row.remainingPortfolioKeys),
    remainingWalletKeys: parseMetric(row.remainingWalletKeys),
    remainingUsers: parseMetric(row.remainingUsers),
  };
}

export class PortfolioRollupSynchronizer {
  async synchronize(jobId: string): Promise<PortfolioRollupSyncStats> {
    let client: PoolClient | null = null;
    const startedAt = Date.now();

    try {
      client = await getDbClient();
      const result = await client.query<PortfolioRollupRow>(
        PROCESS_PORTFOLIO_ROLLUP_QUEUE_SQL,
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error('Portfolio rollup processor returned no metrics row');
      }

      const stats = {
        durationMs: Date.now() - startedAt,
        metrics: parseMetrics(row),
      };

      logger.info('Portfolio rollup queue synchronized', {
        jobId,
        durationMs: stats.durationMs,
        ...stats.metrics,
      });

      return stats;
    } catch (error) {
      logger.error('Portfolio rollup synchronization failed', {
        jobId,
        durationMs: Date.now() - startedAt,
        error: toErrorMessage(error),
      });
      throw error;
    } finally {
      client?.release();
    }
  }
}

export const portfolioRollupSynchronizer = new PortfolioRollupSynchronizer();
