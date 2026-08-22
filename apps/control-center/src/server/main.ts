import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { serve } from '@hono/node-server';
import dotenv from 'dotenv';

import { createControlCenterApp } from './app.js';
import { readControlCenterConfig } from './config/env.js';

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
);
dotenv.config({ path: resolve(REPO_ROOT, '.env') });

const config = readControlCenterConfig();
serve({
  fetch: createControlCenterApp({ config }).fetch,
  hostname: '127.0.0.1',
  port: config.CONTROL_CENTER_PORT,
});
console.log(
  `Control Center API: http://127.0.0.1:${config.CONTROL_CENTER_PORT}`,
);
