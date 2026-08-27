import { initSentry } from './sentry.js';

/**
 * Whether error reporting is actually on is otherwise invisible: a missing DSN
 * and a code path that never captures look identical from the outside — both
 * are just an empty Sentry project. One line per process turns "Sentry has no
 * events" into a `fly logs | grep sentry` instead of a code read.
 */
const enabled = initSentry(process.env);
console.log(
  `[sentry] ${enabled ? 'enabled' : 'disabled'} environment=${process.env['NODE_ENV'] ?? 'unknown'} release=${process.env['APP_COMMIT_SHA'] ?? 'unknown'}`,
);
