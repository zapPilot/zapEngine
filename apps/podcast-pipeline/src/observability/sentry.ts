import * as Sentry from '@sentry/node';
import { trimToUndefined } from '@zapengine/types/shared';

export interface SentryEnv {
  APP_COMMIT_SHA?: string;
  NODE_ENV?: string;
  SENTRY_PODCAST_PIPELINE_DSN?: string;
}

/**
 * Which part of the pipeline a failure came from. Kept as a closed set because
 * it is sent as a Sentry tag, and tags are only useful while their cardinality
 * stays low enough to group and filter on.
 */
export type PipelineComponent =
  | 'http'
  | 'ingest'
  | 'video-render'
  | 'video-visual'
  | 'video-worker'
  | 'social-daemon';

export interface PipelineExceptionOptions {
  component: PipelineComponent;
  /** Low-cardinality dimensions only. Anything per-episode belongs in `context`. */
  tags?: Record<string, string | undefined>;
  /** High-cardinality detail: ids, URLs, attempt counts. */
  context?: Record<string, unknown>;
  level?: 'error' | 'warning';
}

export function initSentry(rawEnv: SentryEnv = process.env) {
  const dsn = trimToUndefined(rawEnv.SENTRY_PODCAST_PIPELINE_DSN);
  if (!dsn) {
    return false;
  }

  Sentry.init({
    dsn,
    environment: trimToUndefined(rawEnv.NODE_ENV),
    release: trimToUndefined(rawEnv.APP_COMMIT_SHA),
    sendDefaultPii: false,
    skipOpenTelemetrySetup: true,
  });
  return true;
}

/**
 * Reports a failure that never surfaces as an HTTP error.
 *
 * Most of this service's work runs in the background — Telegram-triggered ingest
 * and the render worker — and both catch their own errors to notify the
 * submitter. That means neither `app.onError` nor the SDK's unhandled-rejection
 * integration ever sees them, so a whole episode could fail with no Sentry
 * event at all. Call this at the terminal boundary of such work, not on every
 * retryable step: a transient failure that the next attempt recovers from should
 * stay a log line.
 *
 * `step()` wraps failures with `{ cause }`, so Sentry's linkedErrors integration
 * reports the underlying error (the actual `EPIPE`, say) alongside the wrapper.
 */
export function capturePipelineException(
  error: unknown,
  options: PipelineExceptionOptions,
): void {
  Sentry.withScope((scope) => {
    scope.setTag('component', options.component);
    for (const [key, value] of Object.entries(options.tags ?? {})) {
      if (value !== undefined) {
        scope.setTag(key, value);
      }
    }
    if (options.context) {
      scope.setContext('pipeline', options.context);
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
  capturePipelineException(error, {
    component: 'http',
    tags: {
      'http.method': context.method,
      'http.route': context.route,
    },
  });
}

/**
 * Drains buffered events before a short-lived process exits. A failed flush is
 * intentionally non-throwing: observability must never replace the original
 * process failure or prevent an on-demand worker from shutting down.
 */
export async function flushSentry(timeoutMs = 5_000): Promise<boolean> {
  try {
    return await Sentry.flush(timeoutMs);
  } catch {
    return false;
  }
}
