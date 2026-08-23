import type { PoolClient, QueryResultRow } from 'pg';

import { getDbClient } from '../../config/database.js';
import { toErrorMessage } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

const REBUILD_CATEGORY_TRENDS_SQL = `
  SELECT
    users_processed AS "usersProcessed",
    trend_rows_written AS "trendRowsWritten"
  FROM analytics.rebuild_category_trends($1::text[])
`;

interface PortfolioRollupRow extends QueryResultRow {
  usersProcessed: string | number;
  trendRowsWritten: string | number;
}

export interface PortfolioRollupMetrics {
  usersProcessed: number;
  trendRowsWritten: number;
}

export interface PortfolioRollupSyncStats {
  durationMs: number;
  metrics: PortfolioRollupMetrics;
}

function parseMetric(value: string | number): number {
  return typeof value === 'number' ? value : Number.parseInt(value, 10);
}

export class PortfolioRollupSynchronizer {
  async synchronize(
    jobId: string,
    userIds: string[] | null,
  ): Promise<PortfolioRollupSyncStats> {
    let client: PoolClient | null = null;
    const startedAt = Date.now();

    try {
      client = await getDbClient();
      const result = await client.query<PortfolioRollupRow>(
        REBUILD_CATEGORY_TRENDS_SQL,
        [userIds],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error('Category trend rebuild returned no metrics row');
      }

      const stats = {
        durationMs: Date.now() - startedAt,
        metrics: {
          usersProcessed: parseMetric(row.usersProcessed),
          trendRowsWritten: parseMetric(row.trendRowsWritten),
        },
      };

      logger.info('Category trends rebuilt', {
        jobId,
        userScope: userIds,
        durationMs: stats.durationMs,
        ...stats.metrics,
      });

      return stats;
    } catch (error) {
      logger.error('Category trend rebuild failed', {
        jobId,
        userScope: userIds,
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
