import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  // Public surface is the package `exports` (`.`, `./tailwind-preset`, the CSS)
  // mapped to dist + the `tsx src/*.ts` codegen scripts; knip cannot map those
  // dist-targeted exports back to src, so it false-flags src/tailwind-preset.ts.
  // Treat all src as entry (small tokens package — every file is public or a
  // codegen script); the meaningful signal here is unused dependencies.
  entry: ['src/**/*.ts'],
  project: ['src/**/*.ts'],
  includeEntryExports: false,
});
