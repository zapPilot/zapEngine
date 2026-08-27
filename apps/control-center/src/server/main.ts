import { serve } from '@hono/node-server';

import { initSentry } from './observability/sentry.js';

const sentryEnabled = initSentry(process.env);
console.log(
  `[sentry] ${sentryEnabled ? 'enabled' : 'disabled'} environment=${process.env['NODE_ENV'] ?? 'unknown'} release=${process.env['APP_COMMIT_SHA'] ?? 'unknown'}`,
);

const [{ createControlCenterApp }, { readControlCenterConfig }] =
  await Promise.all([import('./app.js'), import('./config/env.js')]);

const config = readControlCenterConfig();
serve({
  fetch: createControlCenterApp({ config }).fetch,
  hostname: '127.0.0.1',
  port: config.CONTROL_CENTER_PORT,
});
console.log(
  `Control Center API: http://127.0.0.1:${config.CONTROL_CENTER_PORT}`,
);
