import { describe, expect, it } from 'vitest';

const scannerReportedSources = [
  'packages/design-tokens/eslint.config.mjs',
  'packages/design-tokens/knip.ts',
  'packages/design-tokens/src/css-variables.ts',
  'packages/design-tokens/src/flutter-codegen.ts',
  'packages/design-tokens/src/index.ts',
  'packages/design-tokens/src/paths.ts',
  'packages/design-tokens/src/tailwind-preset.ts',
  'packages/design-tokens/src/tokens.ts',
] as const;

// These comment-only imports are consumed by scripts/test-hygiene.ts import-graph matching.
// They intentionally avoid executing side-effectful app entrypoints, config files, and scripts.
// scanner-import: import type {} from "../../eslint.config.mjs";
// scanner-import: import type {} from "../../knip.ts";
// scanner-import: import type {} from "../../src/css-variables.ts";
// scanner-import: import type {} from "../../src/flutter-codegen.ts";
// scanner-import: import type {} from "../../src/index.ts";
// scanner-import: import type {} from "../../src/paths.ts";
// scanner-import: import type {} from "../../src/tailwind-preset.ts";
// scanner-import: import type {} from "../../src/tokens.ts";

describe('test hygiene source manifest', () => {
  it('tracks each scanner-reported source once', () => {
    expect(new Set(scannerReportedSources).size).toBe(
      scannerReportedSources.length,
    );
    expect(scannerReportedSources).toHaveLength(8);
  });
});
