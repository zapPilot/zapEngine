import { createControlCenterApp } from '../src/server/app.js';
import { requireControlCenterAuth } from '../src/server/config/auth.js';
import { readControlCenterConfig } from '../src/server/config/env.js';
import { initSentry } from '../src/server/observability/sentry.js';
import { registerPodcastAbandonRoute } from '../src/server/register-podcast-abandon.js';

initSentry(process.env);

const config = readControlCenterConfig();
const app = createControlCenterApp({
  config,
  allowCostSync: false,
  auth: requireControlCenterAuth(config),
});
registerPodcastAbandonRoute(app, { config });

export default app;
