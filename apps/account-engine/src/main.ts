import { initSentry } from './observability/sentry';

// Must run before './app' is required so the Sentry SDK can instrument the
// modules it pulls in. tsc's CommonJS emit keeps requires in source order.
initSentry(process.env);

import { bootstrap } from './app';

export { bootstrap };

if (process.env['NODE_ENV'] !== 'test') {
  bootstrap();
}
