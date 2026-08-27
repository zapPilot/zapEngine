import {
  captureBackgroundException,
  flushSentry,
  initSentry,
} from '../src/observability/sentry';

const marker = `account-engine sentry smoke ${new Date().toISOString()}`;

// tsx compiles this app's scripts to CommonJS (no "type": "module" in
// package.json), which does not support top-level await — hence the
// explicit main()/catch instead of the flat script style podcast-pipeline
// uses (that app is ESM).
async function main(): Promise<void> {
  if (!initSentry(process.env)) {
    throw new Error(
      'SENTRY_ACCOUNT_ENGINE_DSN is missing; run this command with the account-engine environment loaded.',
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
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
