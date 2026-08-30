import { createControlCenterApp } from '../src/server/app.js';
import { readControlCenterConfig } from '../src/server/config/env.js';
import { initSentry } from '../src/server/observability/sentry.js';

initSentry(process.env);

export default createControlCenterApp({
  config: readControlCenterConfig(),
  serveClient: false,
  allowCostSync: false,
});
