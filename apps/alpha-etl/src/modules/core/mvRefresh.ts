import type { PoolClient } from 'pg';
import { MV_REFRESH_CONFIG, getDbClient } from '../../config/database.js';
import { env } from '../../config/environment.js';
import { toErrorMessage } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { withRetry } from '../../utils/retry.js';

export interface MVRefreshResult {
  success: boolean;
  mvName: string;
  durationMs: number;
  error?: string;
  skipped?: boolean;
}

export interface MVRefreshStats {
  totalDurationMs: number;
  results: MVRefreshResult[];
  allSucceeded: boolean;
  failedCount: number;
  skippedCount: number;
}

type MaterializedViewConfig = (typeof MV_REFRESH_CONFIG.MATERIALIZED_VIEWS)[number];

/**
 * Materialized View Refresh Service
 *
 * Refreshes materialized views after ETL job completion to provide
 * immediate data visibility without waiting for periodic cronjobs.
 *
 * Features:
 * - SEQUENTIAL refresh (dependencies respected)
 * - Abort on first failure (don't refresh dependent MVs)
 * - No timeout constraints (waits for completion)
 * - Retry logic with exponential backoff
 * - Per-MV metrics tracking
 * - Graceful error handling (non-fatal)
 */
export class MaterializedViewRefresher {
  /**
   * Refresh all configured materialized views after ETL completion
   *
   * MVs are refreshed SEQUENTIALLY to respect dependencies.
   * If any MV fails, subsequent MVs are skipped (abort-on-failure).
   *
   * @param jobId - ETL job ID for logging context
   * @returns Stats about refresh operations
   */
  async refreshAllViews(jobId: string): Promise<MVRefreshStats> {
    if (!env.ENABLE_MV_REFRESH) {
      logger.debug('MV refresh disabled via configuration', { jobId });
      return {
        totalDurationMs: 0,
        results: [],
        allSucceeded: true,
        failedCount: 0,
        skippedCount: 0
      };
    }

    const mvConfigs = MV_REFRESH_CONFIG.MATERIALIZED_VIEWS;
    logger.info('Starting materialized view refresh (sequential mode)', {
      jobId,
      mvCount: mvConfigs.length,
      mvNames: mvConfigs.map((mv) => mv.name)
    });

    const startTime = Date.now();
    const results = await this.refreshViewsSequentially(jobId, mvConfigs);

    const totalDurationMs = Date.now() - startTime;
    const failedCount = results.filter((r) => !r.success && !r.skipped).length;
    const skippedCount = results.filter((r) => r.skipped).length;
    const stats: MVRefreshStats = {
      totalDurationMs,
      results,
      allSucceeded: failedCount === 0 && skippedCount === 0,
      failedCount,
      skippedCount
    };

    logger.info('Materialized view refresh completed', {
      jobId,
      totalDurationMs: stats.totalDurationMs,
      allSucceeded: stats.allSucceeded,
      failedCount: stats.failedCount,
      skippedCount: stats.skippedCount,
      successCount: stats.results.length - stats.failedCount - stats.skippedCount,
      results: stats.results.map((result) => ({
        mvName: result.mvName,
        success: result.success,
        skipped: result.skipped ?? false,
        durationMs: result.durationMs
      }))
    });
    return stats;
  }

  private async refreshViewsSequentially(
    jobId: string,
    mvConfigs: readonly MaterializedViewConfig[]
  ): Promise<MVRefreshResult[]> {
    const results: MVRefreshResult[] = [];
    let aborted = false;

    // Refresh MVs SEQUENTIALLY - order matters for dependencies
    for (let i = 0; i < mvConfigs.length; i++) {
      const mvConfig = mvConfigs[i];

      if (aborted) {
        results.push({
          success: false,
          mvName: mvConfig.name,
          durationMs: 0,
          skipped: true,
          error: 'Skipped due to previous MV failure'
        });
        continue;
      }

      const result = await this.refreshViewWithRetry(mvConfig.name, jobId);
      results.push(result);

      if (!result.success) {
        aborted = true;
        const remainingMvs = mvConfigs.slice(i + 1).map((mv) => mv.name);
        logger.error('Aborting MV refresh chain due to failure', {
          jobId,
          failedMv: mvConfig.name,
          remainingMvs,
          reason: 'Subsequent MVs may depend on failed MV'
        });
      }
    }

    return results;
  }

  /**
   * Refresh a single materialized view with retry logic
   *
   * @param mvName - Fully qualified MV name (e.g., 'alpha_raw.daily_wallet_token_snapshots')
   * @param jobId - ETL job ID for logging context
   * @returns Result of refresh operation
   */
  private async refreshViewWithRetry(
    mvName: string,
    jobId: string
  ): Promise<MVRefreshResult> {
    const maxAttempts = MV_REFRESH_CONFIG.MAX_RETRIES + 1;

    try {
      return await withRetry(
        () => this.refreshView(mvName, jobId),
        {
          maxAttempts,
          baseDelayMs: MV_REFRESH_CONFIG.RETRY_BASE_DELAY_MS,
          label: `MV refresh ${mvName}`
        }
      );
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      logger.error('MV refresh failed after all retries', {
        jobId,
        mvName,
        maxRetries: maxAttempts,
        error: errorMessage
      });
      return {
        success: false,
        mvName,
        durationMs: 0,
        error: `Failed after ${maxAttempts} attempts: ${errorMessage}`
      };
    }
  }

  /**
   * Refresh a single materialized view
   *
   * Uses REFRESH MATERIALIZED VIEW CONCURRENTLY which:
   * - Allows reads during refresh (non-blocking)
   * - Requires a unique index on the MV
   * - Takes longer but prevents read locks
   *
   * @param mvName - Fully qualified MV name
   * @param jobId - ETL job ID for logging context
   * @returns Result of refresh operation
   */
  private async refreshView(
    mvName: string,
    jobId: string
  ): Promise<MVRefreshResult> {
    let client: PoolClient | null = null;
    const startTime = Date.now();

    try {
      logger.debug('Refreshing materialized view', {
        jobId,
        mvName
      });

      client = await getDbClient();

      await client.query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${mvName}`);

      const durationMs = Date.now() - startTime;

      logger.info('Materialized view refreshed successfully', {
        jobId,
        mvName,
        durationMs
      });

      return {
        success: true,
        mvName,
        durationMs
      };

    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = toErrorMessage(error);

      logger.error('Failed to refresh materialized view', {
        jobId,
        mvName,
        durationMs,
        error: errorMessage
      });

      throw error;

    } finally {
      client?.release();
    }
  }

  /**
   * Check if MV refresh is enabled in configuration
   */
  static isEnabled(): boolean {
    return env.ENABLE_MV_REFRESH;
  }

  /**
   * Get list of materialized views that will be refreshed
   */
  static getMaterializedViews(): string[] {
    return MV_REFRESH_CONFIG.MATERIALIZED_VIEWS.map((mv) => mv.name);
  }
}

/**
 * Singleton instance for MV refresh operations
 */
export const mvRefresher = new MaterializedViewRefresher();
