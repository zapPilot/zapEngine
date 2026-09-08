import { isClientError } from '@zapengine/app-core/lib/errors';
import type { ErrorReportContext } from '@zapengine/app-core/lib/observability/errorReporter';

/** A Sentry `captureException` call, described without calling Sentry. */
export interface HandledErrorReport {
  /** Sentry only groups real `Error` instances, so non-errors are wrapped. */
  error: Error;
  /** Groups every report from one seam, e.g. `react-query`. */
  scope: string;
  /** Diagnostic fields from the reporting call site. */
  extra: Record<string, unknown>;
}

/**
 * Decide whether a handled error deserves a Sentry event, and shape it.
 *
 * Pure on purpose: there is no DSN in dev or e2e, so `Sentry.init` never runs
 * there and the decision would otherwise be untestable.
 *
 * @param error - The reported error value.
 * @param context - Scope and diagnostic fields from the reporting call site.
 * @returns The report to capture, or `null` when the error is not worth one.
 */
export function buildHandledErrorReport(
  error: unknown,
  context: ErrorReportContext,
): HandledErrorReport | null {
  // The reporter seam is not query-only, so the same 4xx rule app-core applies
  // to query failures is applied again here: a rejected request is the user's
  // session or input, not an incident, whichever seam surfaced it.
  if (isClientError(error)) {
    return null;
  }

  return {
    error: error instanceof Error ? error : new Error(String(error)),
    scope: context.scope,
    extra: context.extra ?? {},
  };
}
