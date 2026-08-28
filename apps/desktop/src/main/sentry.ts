import type { ElectronMainOptions } from '@sentry/electron/main';
import { trimToUndefined } from '@zapengine/types/shared';

export function buildDesktopSentryOptions(
  dsn: string | undefined,
  release: string | undefined,
): ElectronMainOptions | undefined {
  const normalizedDsn = trimToUndefined(dsn);
  if (!normalizedDsn) {
    return undefined;
  }

  return {
    dsn: normalizedDsn,
    enableLogs: false,
    release: trimToUndefined(release),
    sendDefaultPii: false,
    skipOpenTelemetrySetup: true,
  };
}

/**
 * Where a failure came from. Closed set because it is sent as a Sentry tag,
 * and tags are only useful while their cardinality stays low enough to group
 * and filter on.
 */
export type DesktopComponent = 'bootstrap' | 'scheduler' | 'asset-protocol';

export interface DesktopExceptionOptions {
  component: DesktopComponent;
  /** Low-cardinality dimensions only. Anything per-request/per-attempt belongs in `context`. */
  tags?: Record<string, string | undefined>;
  /** High-cardinality detail: paths, ids, attempt counts. */
  context?: Record<string, unknown>;
  level?: 'error' | 'warning';
}

/**
 * `@sentry/electron/main`'s barrel pulls in Electron-context integrations
 * that import the real `electron` module at load time, which only resolves
 * inside the actual Electron process. A static top-level import here would
 * break every unit test that merely imports this file for its pure helpers;
 * importing it lazily, only when a capture/flush actually runs, keeps this
 * module side-effect-free to load.
 */
function loadSentryMain() {
  return import('@sentry/electron/main');
}

async function reportDesktopException(
  error: unknown,
  options: DesktopExceptionOptions,
): Promise<void> {
  const { captureException, withScope } = await loadSentryMain();
  withScope((scope) => {
    scope.setTag('component', options.component);
    for (const [key, value] of Object.entries(options.tags ?? {})) {
      if (value !== undefined) {
        scope.setTag(key, value);
      }
    }
    if (options.context) {
      scope.setContext('desktop', options.context);
    }
    if (options.level) {
      scope.setLevel(options.level);
    }
    captureException(error);
  });
}

/**
 * Reports a failure that Sentry's default HTTP/unhandled-rejection capture
 * never sees: the rebalance scheduler catches its own tick errors to keep
 * polling, bootstrap failures resolve through a handled `.catch()`, and
 * asset-protocol failures are converted straight into a `Response`. Call this
 * at the terminal boundary of such work, not on every retryable step.
 */
export function captureDesktopException(
  error: unknown,
  options: DesktopExceptionOptions,
): void {
  void reportDesktopException(error, options);
}

/**
 * Drains buffered events before the app actually quits. A failed flush is
 * intentionally non-throwing: observability must never block shutdown.
 */
export async function flushSentry(timeoutMs = 5_000): Promise<boolean> {
  try {
    const { flush } = await loadSentryMain();
    return await flush(timeoutMs);
  } catch {
    return false;
  }
}
