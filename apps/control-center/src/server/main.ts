import { serve } from '@hono/node-server';

import { initSentry } from './observability/sentry.js';

initSentry(process.env);

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
