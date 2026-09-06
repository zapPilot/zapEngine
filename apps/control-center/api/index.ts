import { createControlCenterApp } from '../src/server/app.js';
import { requireControlCenterAuth } from '../src/server/config/auth.js';
import { readControlCenterConfig } from '../src/server/config/env.js';
import { initSentry } from '../src/server/observability/sentry.js';

initSentry(process.env);

const config = readControlCenterConfig();

export default createControlCenterApp({
  config,
  allowCostSync: false,
  auth: requireControlCenterAuth(config),
});
