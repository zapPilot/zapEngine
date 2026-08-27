import {
  checkCostSyncCredentials,
  readControlCenterConfig,
} from './config/env.js';
import { syncCosts } from './services/cost-sync.js';

const config = readControlCenterConfig();
const credentials = checkCostSyncCredentials(config);
console.log(
  `credentials: ${credentials
    .map(({ name, present }) => `${name}=${present ? 'set' : 'MISSING'}`)
    .join(' ')}`,
);

const missing = credentials
  .filter(({ present }) => !present)
  .map(({ name }) => name);
if (missing.length > 0) {
  console.error(
    `Refusing to sync: ${missing.join(', ')} not visible to this process. ` +
      'Check Infisical prod and the ops:sync env list in apps/control-center/turbo.json.',
  );
  process.exit(1);
}

const summary = await syncCosts({ config });
for (const provider of summary.providers) {
  const marker =
    provider.status === 'persisted'
      ? '✓'
      : provider.status === 'error'
        ? '!'
        : '-';
  const cost =
    provider.accruedCostUsd === null
      ? ''
      : ` $${provider.accruedCostUsd.toFixed(3)}`;
  const message = provider.message ? ` — ${provider.message}` : '';
  console.log(`${marker} ${provider.label}${cost}${message}`);
}
console.log(`\n${summary.persisted} snapshots persisted`);

// A provider that failed mid-fetch used to leave the run green, so the cron
// reported success while a column of the cost dashboard stopped advancing.
const failed = summary.providers.filter(
  (provider) => provider.status === 'error',
);
if (failed.length > 0) {
  console.error(
    `${failed.length} provider(s) failed: ${failed
      .map((provider) => provider.provider)
      .join(', ')}`,
  );
  process.exit(1);
}
