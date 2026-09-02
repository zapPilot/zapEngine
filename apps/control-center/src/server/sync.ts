import {
  checkCostSyncCredentials,
  readControlCenterConfig,
} from './config/env.js';
import { syncCosts } from './services/cost-sync.js';
import { syncMetricSnapshots } from './services/metric-snapshot-sync.js';

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
}

// Same job, same schedule: every headline number on the redesigned dashboard
// needs its own history, so this writes `ops.metric_snapshots` right after
// the cost snapshots rather than adding a second cron.
let metricSyncFailed = false;
try {
  const metricSummary = await syncMetricSnapshots({ config });
  console.log(
    `\n${metricSummary.persisted} metric snapshots persisted` +
      (metricSummary.skipped.length
        ? ` (skipped: ${metricSummary.skipped.join(', ')})`
        : ''),
  );
} catch (error) {
  metricSyncFailed = true;
  console.error(
    `metric snapshot sync failed: ${error instanceof Error ? error.message : String(error)}`,
  );
}

if (failed.length > 0 || metricSyncFailed) {
  process.exit(1);
}
