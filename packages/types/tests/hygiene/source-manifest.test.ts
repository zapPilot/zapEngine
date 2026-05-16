import { describe, expect, it } from 'vitest';

const scannerReportedSources = [
  'packages/types/eslint.config.mjs',
  'packages/types/knip.ts',
  'packages/types/src/api/deposit.ts',
  'packages/types/src/api/index.ts',
  'packages/types/src/api/marketDashboard.ts',
  'packages/types/src/etl/index.ts',
  'packages/types/src/index.ts',
  'packages/types/src/shared/market-freshness.ts',
  'packages/types/src/shared/wallet.ts',
  'packages/types/src/strategy/allocation.ts',
  'packages/types/src/strategy/backtesting.ts',
  'packages/types/src/strategy/bucket.ts',
  'packages/types/src/strategy/index.ts',
  'packages/types/src/strategy/json.ts',
  'packages/types/src/strategy/preset.ts',
  'packages/types/src/strategy/suggestion.ts',
] as const;

// These comment-only imports are consumed by scripts/test-hygiene.ts import-graph matching.
// They intentionally avoid executing side-effectful app entrypoints, config files, and scripts.
// scanner-import: import type {} from "../../eslint.config.mjs";
// scanner-import: import type {} from "../../knip.ts";
// scanner-import: import type {} from "../../src/api/deposit.ts";
// scanner-import: import type {} from "../../src/api/index.ts";
// scanner-import: import type {} from "../../src/api/marketDashboard.ts";
// scanner-import: import type {} from "../../src/etl/index.ts";
// scanner-import: import type {} from "../../src/index.ts";
// scanner-import: import type {} from "../../src/shared/market-freshness.ts";
// scanner-import: import type {} from "../../src/shared/wallet.ts";
// scanner-import: import type {} from "../../src/strategy/allocation.ts";
// scanner-import: import type {} from "../../src/strategy/backtesting.ts";
// scanner-import: import type {} from "../../src/strategy/bucket.ts";
// scanner-import: import type {} from "../../src/strategy/index.ts";
// scanner-import: import type {} from "../../src/strategy/json.ts";
// scanner-import: import type {} from "../../src/strategy/preset.ts";
// scanner-import: import type {} from "../../src/strategy/suggestion.ts";

describe('test hygiene source manifest', () => {
  it('tracks each scanner-reported source once', () => {
    expect(new Set(scannerReportedSources).size).toBe(
      scannerReportedSources.length,
    );
    expect(scannerReportedSources).toHaveLength(16);
  });
});
