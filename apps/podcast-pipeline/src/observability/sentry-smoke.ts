import { capturePipelineException, flushSentry, initSentry } from './sentry.js';

const marker = `podcast-pipeline sentry smoke ${new Date().toISOString()}`;

if (!initSentry(process.env)) {
  throw new Error(
    'SENTRY_PODCAST_PIPELINE_DSN is missing; run this command with the podcast-pipeline environment loaded.',
  );
}

capturePipelineException(new Error(marker), {
  component: 'ingest',
  tags: { entrypoint: 'sentry-smoke' },
});

const flushed = await flushSentry(5_000);
if (!flushed) {
  throw new Error(`Sentry smoke event did not flush: ${marker}`);
}

console.log(`Sentry smoke event flushed: ${marker}`);
process.exit(0);
