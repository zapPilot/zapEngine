import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

import { readControlCenterConfig } from './config/env.js';
import { syncCosts } from './services/cost-sync.js';

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
);
dotenv.config({ path: resolve(repoRoot, '.env') });

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
