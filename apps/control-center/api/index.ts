import { createControlCenterApp } from '../src/server/app.js';
import { readControlCenterConfig } from '../src/server/config/env.js';
import { initSentry } from '../src/server/observability/sentry.js';
import { registerPodcastAbandonRoute } from '../src/server/register-podcast-abandon.js';

initSentry(process.env);

const config = readControlCenterConfig();
const app = createControlCenterApp({
  config,
  serveClient: false,
  allowCostSync: false,
});
registerPodcastAbandonRoute(app, { config });

export default app;
