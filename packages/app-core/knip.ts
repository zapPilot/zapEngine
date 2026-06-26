import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  // Library package consumed across the monorepo. Its public surface is the
  // package `exports` map, which includes a `./*` wildcard — so any source file
  // is importable by a sibling workspace. knip runs per-package (it cannot see
  // those cross-workspace consumers), so every source file is treated as an
  // entry to avoid false "unused file/export" reports for legitimate public
  // API. The still-meaningful signal here is unused dependencies, computed from
  // the imports across all of these files.
  entry: ['src/**/*.{ts,tsx}'],
  project: ['src/**/*.{ts,tsx}'],
  // Both are genuinely used but only via subpath/type-only imports
  // (@zapengine/types/strategy|api, @zapengine/intent-engine's GmxV2MarketKey /
  // waitForEIP7702Confirmation) that knip's workspace resolver does not track —
  // mirroring intent-engine's own knip config. @zapengine/design-tokens is a
  // Tailwind preset with no direct TS import.
  ignoreDependencies: [
    '@zapengine/design-tokens',
    '@zapengine/intent-engine',
    '@zapengine/types',
  ],
});
