import { initSentry } from './observability/sentry.js';

initSentry(process.env);

const { startServer } = await import('./app.js');
await startServer();
