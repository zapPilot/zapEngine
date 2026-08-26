import { readControlCenterConfig } from './config/env.js';
import { degradedProviders, syncCosts } from './services/cost-sync.js';

const summary = await syncCosts({ config: readControlCenterConfig() });
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

const degraded = degradedProviders(summary);
if (degraded.length > 0) {
  console.error(
    `Expected providers with no snapshot: ${degraded
      .map((provider) => provider.label)
      .join(', ')}`,
  );
  process.exitCode = 1;
}
