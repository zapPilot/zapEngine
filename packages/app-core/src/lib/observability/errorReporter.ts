/**
 * Handled-error seam for app-core.
 *
 * app-core is shared by the React Native app, the browser build and the
 * Electron host, and each of them binds a different error-reporting SDK. So the
 * host injects the implementation at bootstrap, exactly the way it injects the
 * environment through `configureAppCoreEnv`, and this package never imports a
 * reporting SDK itself.
 *
 * Until a host injects one, every report is dropped: dev and e2e have no DSN,
 * and a shared module must not decide to log on their behalf.
 *
 * Keep this module a leaf. `lib/http/request` already reaches `lib/state/queryClient`,
 * and queryClient reports through here — an import back into `lib/http`,
 * `lib/errors` or `services` would close that circle and leave `reportHandledError`
 * undefined at module-eval time with no error to show for it.
 */

/** Structured detail attached to a report. Never carries user payloads. */
export interface ErrorReportContext {
  /** Call-site label used for grouping, e.g. `react-query`. */
  scope: string;
  /** Diagnostic fields: identifiers and schema shape, never response bodies. */
  extra?: Record<string, unknown>;
}

export type ErrorReporter = (
  error: unknown,
  context: ErrorReportContext,
) => void;

const noopReporter: ErrorReporter = () => {
  // No host reporter yet, and app-core has no opinion about where to log.
};

let reporter: ErrorReporter = noopReporter;

/**
 * Install the host's error reporter.
 *
 * Call once during bootstrap, before any module that can fail evaluates —
 * anything reported earlier is lost.
 *
 * @param next - Reporter implementation, or `undefined` to fall back to the no-op.
 */
export function setErrorReporter(next: ErrorReporter | undefined): void {
  reporter = next ?? noopReporter;
}

/**
 * Report an error the caller has already handled.
 *
 * Never throws and never changes control flow: callers keep whatever behavior
 * they had before the report existed.
 *
 * @param error - The error value being reported.
 * @param context - Scope and diagnostic fields for the report.
 */
export function reportHandledError(
  error: unknown,
  context: ErrorReportContext,
): void {
  try {
    reporter(error, context);
  } catch {
    // A broken reporter must never escalate into the failure it is reporting.
  }
}
