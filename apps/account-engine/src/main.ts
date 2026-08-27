import { initSentry } from './observability/sentry';

// Must run before './app' is required so the Sentry SDK can instrument the
// modules it pulls in. tsc's CommonJS emit keeps requires in source order.
const sentryEnabled = initSentry(process.env);
console.log(
  `[sentry] ${sentryEnabled ? 'enabled' : 'disabled'} environment=${process.env['NODE_ENV'] ?? 'unknown'} release=${process.env['APP_COMMIT_SHA'] ?? 'unknown'}`,
);

import { bootstrap } from './app';

export { bootstrap };

if (process.env['NODE_ENV'] !== 'test') {
  bootstrap();
}
