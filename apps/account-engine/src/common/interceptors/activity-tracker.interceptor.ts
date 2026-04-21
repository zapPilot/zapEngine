import { Logger } from '@common/logger';
import { getErrorMessage } from '@common/utils';
import { DatabaseService } from '@database/database.service';
import type { MiddlewareHandler } from 'hono';

/**
 * ActivityTracker updates users.last_activity_at for a given userId with
 * 1-hour debouncing, non-blocking background writes, and graceful failure
 * handling (logs + cache revert on error). Uses the service-role client
 * to bypass RLS.
 *
 * Consumed by: alpha-etl (activity-based update frequency)
 */
export class ActivityTracker {
  private readonly logger = new Logger(ActivityTracker.name);
  private readonly activityCache = new Map<string, number>();
  private readonly DEBOUNCE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
  private readonly STALE_CACHE_THRESHOLD_MS = this.DEBOUNCE_WINDOW_MS * 2; // 2 hours

  /* istanbul ignore next -- DI constructor */
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Track activity for a userId. Debounces repeated calls within the
   * 1-hour window and performs the DB write asynchronously via setImmediate.
   * Accepts `unknown` so callers can forward raw values from HTTP context
   * without pre-validating (non-string / empty / whitespace are ignored).
   */
  trackUserId(rawUserId: unknown): void {
    const userId = this.normalizeUserId(rawUserId);
    if (!userId) return;

    const now = Date.now();
    const lastUpdate = this.activityCache.get(userId);
    if (lastUpdate && now - lastUpdate < this.DEBOUNCE_WINDOW_MS) return;

    this.activityCache.set(userId, now);
    setImmediate(() => {
      void this.safeUpdateUserActivity(userId);
    });
  }

  private async safeUpdateUserActivity(userId: string): Promise<void> {
    try {
      await this.updateUserActivity(userId);
    } catch (error) {
      this.logger.warn(
        `Failed to update activity for user ${userId}: ${getErrorMessage(
          error,
        )}`,
      );
      // Revert cache on failure so the next request retries instead of debouncing.
      this.activityCache.delete(userId);
    }
  }

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

  /** Optional periodic cleanup — drops entries older than 2× debounce window. */
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

/**
 * Hono middleware: reads userId from the matched route's path params (or
 * query string as a fallback) and forwards to the tracker. Must be mounted
 * on a pattern that declares `:userId` — e.g. inside a route group as
 * `app.use('/:userId', mw)` and `app.use('/:userId/*', mw)` — because
 * `c.req.param()` resolves against the middleware's own registered pattern,
 * not downstream route patterns.
 */
export function createActivityTrackingMiddleware(
  tracker: ActivityTracker,
): MiddlewareHandler {
  return async (c, next) => {
    tracker.trackUserId(c.req.param('userId') ?? c.req.query('userId'));
    await next();
  };
}
