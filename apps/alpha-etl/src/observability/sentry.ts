import * as Sentry from '@sentry/node';

export interface SentryEnv {
  APP_COMMIT_SHA?: string;
  NODE_ENV?: string;
  SENTRY_ALPHA_ETL_DSN?: string;
}

/**
 * Where a background failure came from. Kept as a closed set because it is
 * sent as a Sentry tag, and tags are only useful while their cardinality
 * stays low enough to group and filter on.
 */
export type AlphaEtlComponent = 'http' | 'job' | 'db-health';

export interface BackgroundExceptionOptions {
  component: AlphaEtlComponent;
  /** Low-cardinality dimensions only. Anything per-job/id belongs in `context`. */
  tags?: Record<string, string | undefined>;
  /** High-cardinality detail: ids, URLs, attempt counts. */
  context?: Record<string, unknown>;
  level?: 'error' | 'warning';
}

function normalize(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function initSentry(rawEnv: SentryEnv = process.env) {
  const dsn = normalize(rawEnv.SENTRY_ALPHA_ETL_DSN);
  if (!dsn) {
    return false;
  }

  Sentry.init({
    dsn,
    environment: normalize(rawEnv.NODE_ENV),
    release: normalize(rawEnv.APP_COMMIT_SHA),
    sendDefaultPii: false,
    skipOpenTelemetrySetup: true,
  });
  return true;
}

/**
 * Reports a failure that never surfaces as an HTTP error.
 *
 * The job queue and the database health poller catch their own errors and
 * either persist a status row or log a warning; neither goes through
 * `app.onError` or the SDK's unhandled-rejection integration, so a failed job
 * could otherwise leave no Sentry event at all. Call this at the terminal
 * boundary of such work, not on every retryable step: a transient failure the
 * next attempt recovers from should stay a log line.
 *
 * `cause` on the passed-in error is preserved: Sentry's linkedErrors
 * integration reports it alongside the wrapper.
 */
export function captureBackgroundException(
  error: unknown,
  options: BackgroundExceptionOptions,
): void {
  Sentry.withScope((scope) => {
    scope.setTag('component', options.component);
    for (const [key, value] of Object.entries(options.tags ?? {})) {
      if (value !== undefined) {
        scope.setTag(key, value);
      }
    }
    if (options.context) {
      scope.setContext('alpha-etl', options.context);
    }
    if (options.level) {
      scope.setLevel(options.level);
    }
    Sentry.captureException(error);
  });
}

export function captureServerException(
  error: unknown,
  context: { method?: string; route?: string } = {},
) {
  captureBackgroundException(error, {
    component: 'http',
    tags: {
      'http.method': context.method,
      'http.route': context.route,
    },
  });
}

/**
 * Drains buffered events before the process exits. A failed flush is
 * intentionally non-throwing: observability must never replace the original
 * process failure or block shutdown.
 */
export async function flushSentry(timeoutMs = 5_000): Promise<boolean> {
  try {
    return await Sentry.flush(timeoutMs);
  } catch {
    return false;
  }
}
