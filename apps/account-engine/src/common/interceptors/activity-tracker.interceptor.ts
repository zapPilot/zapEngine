import { Logger } from '@common/logger';
import { getErrorMessage } from '@common/utils';
import { DatabaseService } from '@database/database.service';
import type { MiddlewareHandler } from 'hono';

/**
 * ActivityTrackerInterceptor tracks user activity by updating users.last_activity_at
 * whenever a request contains a userId (in params, query, or body).
 *
 * Features:
 * - 1-hour debouncing to reduce database writes by ~95%
 * - Non-blocking background updates using setImmediate()
 * - Graceful error handling (logs warnings, doesn't break requests)
 * - Uses service role client to bypass RLS
 *
 * Updated by: account-engine
 * Used by: alpha-etl (for activity-based update frequency)
 */
export class ActivityTracker {
  private readonly logger = new Logger(ActivityTracker.name);
  private readonly activityCache = new Map<string, number>();
  private readonly DEBOUNCE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
  private readonly STALE_CACHE_THRESHOLD_MS = this.DEBOUNCE_WINDOW_MS * 2; // 2 hours

  /* istanbul ignore next -- DI constructor */
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Intercept requests and track user activity if userId is present
   */
  trackRequest(request: {
    params?: Record<string, string | undefined>;
    query?: Record<string, string | undefined>;
  }): void {
    const paramsUserId = this.normalizeUserId(request.params?.userId);
    if (paramsUserId) {
      this.trackUserActivity(paramsUserId);
      return;
    }

    const queryUserId = this.normalizeUserId(request.query?.userId);
    if (queryUserId) {
      this.trackUserActivity(queryUserId);
    }
  }

  /**
   * Track user activity with 1-hour debouncing
   * Updates database in background without blocking request
   */
  private trackUserActivity(userId: string): void {
    const now = Date.now();
    const lastUpdate = this.activityCache.get(userId);

    // Skip if updated within last hour (debouncing)
    if (lastUpdate && now - lastUpdate < this.DEBOUNCE_WINDOW_MS) {
      return;
    }

    // Update cache immediately (prevent race conditions)
    this.activityCache.set(userId, now);

    // Update database in background (non-blocking)
    setImmediate(() => {
      void this.safeUpdateUserActivity(userId);
    });
  }

  /**
   * Safely update activity and handle failures without blocking.
   */
  private async safeUpdateUserActivity(userId: string): Promise<void> {
    try {
      await this.updateUserActivity(userId);
    } catch (error) {
      this.logger.warn(
        `Failed to update activity for user ${userId}: ${getErrorMessage(
          error,
        )}`,
      );
      // Revert cache on failure (will retry on next request)
      this.activityCache.delete(userId);
    }
  }

  /**
   * Update users.last_activity_at in database
   * Uses service role client to bypass RLS
   */
  private async updateUserActivity(userId: string): Promise<void> {
    const client = this.databaseService.getServiceRoleClient();

    const { error } = await client
      .from('users')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) throw error;

    this.logger.debug(`Updated activity timestamp for user ${userId}`);
  }

  private normalizeUserId(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  /**
   * Optional: Clean up stale cache entries (>2 hours old)
   * Can be called periodically if needed
   */
  cleanupCache(): void {
    const now = Date.now();
    const staleThreshold = this.STALE_CACHE_THRESHOLD_MS;

    for (const [userId, timestamp] of this.activityCache.entries()) {
      if (now - timestamp > staleThreshold) {
        this.activityCache.delete(userId);
      }
    }
  }
}

export function createActivityTrackingMiddleware(
  tracker: ActivityTracker,
): MiddlewareHandler {
  return async (c, next) => {
    tracker.trackRequest({
      params: c.req.param(),
      query: c.req.query(),
    });
    await next();
  };
}
