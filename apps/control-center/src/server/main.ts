import { serve } from '@hono/node-server';

import { initSentry } from './observability/sentry.js';

initSentry(process.env);

const [{ createControlCenterApp }, { readControlCenterConfig }] =
  await Promise.all([import('./app.js'), import('./config/env.js')]);

const config = readControlCenterConfig();
// Every read path degrades to empty values without Supabase credentials, so a
// missing injection would otherwise serve a blank dashboard with HTTP 200s.
if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. Start the dashboard with `infisical run --env=prod -- pnpm ops:dashboard`.',
  );
}

serve({
  fetch: createControlCenterApp({ config }).fetch,
  hostname: '127.0.0.1',
  port: config.CONTROL_CENTER_PORT,
});
console.log(
  `Control Center API: http://127.0.0.1:${config.CONTROL_CENTER_PORT}`,
);
