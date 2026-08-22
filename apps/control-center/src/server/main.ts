import { serve } from '@hono/node-server';

import { createControlCenterApp } from './app.js';
import { readControlCenterConfig } from './config/env.js';
import { loadEnv } from './paths.js';

loadEnv();

const config = readControlCenterConfig();
serve({
  fetch: createControlCenterApp({ config }).fetch,
  hostname: '127.0.0.1',
  port: config.CONTROL_CENTER_PORT,
});
console.log(
  `Control Center API: http://127.0.0.1:${config.CONTROL_CENTER_PORT}`,
);
