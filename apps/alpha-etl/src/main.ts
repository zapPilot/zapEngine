import { initSentry } from './observability/sentry.js';

const enabled = initSentry(process.env);
console.log(
  `[sentry] ${enabled ? 'enabled' : 'disabled'} environment=${process.env['NODE_ENV'] ?? 'unknown'} release=${process.env['APP_COMMIT_SHA'] ?? 'unknown'}`,
);

const { startServer } = await import('./app.js');
await startServer();
