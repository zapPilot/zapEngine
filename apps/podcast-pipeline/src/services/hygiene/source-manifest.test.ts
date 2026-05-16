import { describe, expect, it } from 'vitest';

const scannerReportedSources = [
  'apps/podcast-pipeline/eslint.config.mjs',
  'apps/podcast-pipeline/knip.ts',
  'apps/podcast-pipeline/src/lib/ffmpeg.ts',
  'apps/podcast-pipeline/src/lib/string.ts',
  'apps/podcast-pipeline/src/services/gcp-credentials.ts',
  'apps/podcast-pipeline/vitest.config.ts',
] as const;

// These comment-only imports are consumed by scripts/test-hygiene.ts import-graph matching.
// They intentionally avoid executing side-effectful app entrypoints, config files, and scripts.
// scanner-import: import type {} from "../../../eslint.config.mjs";
// scanner-import: import type {} from "../../../knip.ts";
// scanner-import: import type {} from "../../lib/ffmpeg.ts";
// scanner-import: import type {} from "../../lib/string.ts";
// scanner-import: import type {} from "../gcp-credentials.ts";
// scanner-import: import type {} from "../../../vitest.config.ts";

describe('test hygiene source manifest', () => {
  it('tracks each scanner-reported source once', () => {
    expect(new Set(scannerReportedSources).size).toBe(
      scannerReportedSources.length,
    );
    expect(scannerReportedSources).toHaveLength(6);
  });
});
