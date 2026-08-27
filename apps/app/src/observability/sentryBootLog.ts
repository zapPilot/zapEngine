/**
 * Whether error reporting is actually on is otherwise invisible: a missing DSN
 * and a code path that never captures look identical from the outside — both
 * are just an empty Sentry project. One line per platform entry point turns
 * "Sentry has no events" into a log grep instead of a code read.
 */
export function logSentryBootStatus(
  enabled: boolean,
  environment: string,
  release: string,
): void {
  console.log(
    `[sentry] ${enabled ? 'enabled' : 'disabled'} environment=${environment} release=${release}`,
  );
}
