#!/usr/bin/env pnpm tsx

import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const ROOT = process.cwd();
const ANALYTICS_SNAPSHOT = join(
  ROOT,
  'apps/analytics-engine/tests/fixtures/strategy_performance_snapshot_500d.json',
);
const LANDING_PAGE_SNAPSHOT = join(
  ROOT,
  'apps/landing-page/src/data/strategy-snapshot.json',
);

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function main() {
  const analyticsSnapshot = readJson(ANALYTICS_SNAPSHOT);
  const landingPageSnapshot = readJson(LANDING_PAGE_SNAPSHOT);

  if (!isDeepStrictEqual(analyticsSnapshot, landingPageSnapshot)) {
    console.error('Strategy snapshot drift detected.');
    console.error(
      `Copy ${relative(ROOT, ANALYTICS_SNAPSHOT)} to ${relative(
        ROOT,
        LANDING_PAGE_SNAPSHOT,
      )}.`,
    );
    process.exit(1);
  }

  console.log('Strategy snapshots are in sync.');
}

main();
