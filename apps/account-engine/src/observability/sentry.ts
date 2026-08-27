import * as Sentry from '@sentry/node';

export interface SentryEnv {
  APP_COMMIT_SHA?: string;
  NODE_ENV?: string;
  SENTRY_ACCOUNT_ENGINE_DSN?: string;
}

/**
 * Which part of the service a failure came from. Kept as a closed set
 * because it is sent as a Sentry tag, and tags are only useful while their
 * cardinality stays low enough to group and filter on.
 */
export type AccountEngineComponent =
  | 'http'
  | 'job'
  | 'job-cleanup'
  | 'job-notification';

export interface BackgroundExceptionOptions {
  component: AccountEngineComponent;
  /** Low-cardinality dimensions only. Anything per-job belongs in `context`. */
  tags?: Record<string, string | undefined>;
  /** High-cardinality detail: jobId, retry counts. Never userId/walletAddress. */
  context?: Record<string, unknown>;
  level?: 'error' | 'warning';
}

function normalize(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function initSentry(rawEnv: SentryEnv = process.env) {
  const dsn = normalize(rawEnv.SENTRY_ACCOUNT_ENGINE_DSN);

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
 * The job queue polls and cleans up in the background and catches its own
 * errors to log or email an admin, so neither `app.onError` nor the SDK's
 * unhandled-rejection integration ever sees them. Call this at the terminal
 * boundary of such work — a failure the next retry will recover from stays a
 * log line, not a capture.
 *
 * Job payloads embed wallet addresses and user UUIDs, same as routes do.
 * `userId` and `walletAddress` must never be passed as `tags` or `context`
 * on any capture call in this app. `jobId` is fine, but belongs in
 * `context`, not `tags`.
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
      scope.setContext('accountEngine', options.context);
    }
    if (options.level) {
      scope.setLevel(options.level);
    }
    Sentry.captureException(error);
  });
}

// `route` must be the registered route pattern, never the concrete request
// path — account-engine routes embed wallet addresses and user UUIDs, which
// would otherwise land in an indexed Sentry tag despite sendDefaultPii: false.
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
 * failure or block shutdown. This app scales to zero Fly machines between
 * requests, so an event buffered but not flushed on shutdown is lost, not
 * delayed.
 */
export async function flushSentry(timeoutMs = 5_000): Promise<boolean> {
  try {
    return await Sentry.flush(timeoutMs);
  } catch {
    return false;
  }
}
