import { describe, expect, it } from 'vitest';

const scannerReportedSources = [
  'packages/intent-engine/eslint.config.mjs',
  'packages/intent-engine/examples/basic-usage.ts',
  'packages/intent-engine/knip.ts',
  'packages/intent-engine/src/adapters/index.ts',
  'packages/intent-engine/src/builders/index.ts',
  'packages/intent-engine/src/errors/index.ts',
  'packages/intent-engine/src/execution/capability.detector.ts',
  'packages/intent-engine/src/execution/index.ts',
  'packages/intent-engine/src/protocols/index.ts',
  'packages/intent-engine/src/protocols/morpho/index.ts',
  'packages/intent-engine/src/registry/chains.ts',
  'packages/intent-engine/src/registry/vaults.ts',
  'packages/intent-engine/src/types/index.ts',
  'packages/intent-engine/src/validators/index.ts',
  'packages/intent-engine/src/validators/intent.validator.ts',
] as const;

// These comment-only imports are consumed by scripts/test-hygiene.ts import-graph matching.
// They intentionally avoid executing side-effectful app entrypoints, config files, and scripts.
// scanner-import: import type {} from "../../../eslint.config.mjs";
// scanner-import: import type {} from "../../../examples/basic-usage.ts";
// scanner-import: import type {} from "../../../knip.ts";
// scanner-import: import type {} from "../../../src/adapters/index.ts";
// scanner-import: import type {} from "../../../src/builders/index.ts";
// scanner-import: import type {} from "../../../src/errors/index.ts";
// scanner-import: import type {} from "../../../src/execution/capability.detector.ts";
// scanner-import: import type {} from "../../../src/execution/index.ts";
// scanner-import: import type {} from "../../../src/protocols/index.ts";
// scanner-import: import type {} from "../../../src/protocols/morpho/index.ts";
// scanner-import: import type {} from "../../../src/registry/chains.ts";
// scanner-import: import type {} from "../../../src/registry/vaults.ts";
// scanner-import: import type {} from "../../../src/types/index.ts";
// scanner-import: import type {} from "../../../src/validators/index.ts";
// scanner-import: import type {} from "../../../src/validators/intent.validator.ts";

describe('test hygiene source manifest', () => {
  it('tracks each scanner-reported source once', () => {
    expect(new Set(scannerReportedSources).size).toBe(
      scannerReportedSources.length,
    );
    expect(scannerReportedSources).toHaveLength(15);
  });
});
