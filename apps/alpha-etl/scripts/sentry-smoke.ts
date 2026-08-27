import {
  captureBackgroundException,
  flushSentry,
  initSentry,
} from '../src/observability/sentry.js';

const marker = `alpha-etl sentry smoke ${new Date().toISOString()}`;

if (!initSentry(process.env)) {
  throw new Error(
    'SENTRY_ALPHA_ETL_DSN is missing; run this command with the alpha-etl environment loaded.',
  );
}

captureBackgroundException(new Error(marker), {
  component: 'job',
  tags: { entrypoint: 'sentry-smoke' },
});

const flushed = await flushSentry(5_000);
if (!flushed) {
  throw new Error(`Sentry smoke event did not flush: ${marker}`);
}

console.log(`Sentry smoke event flushed: ${marker}`);
process.exit(0);
