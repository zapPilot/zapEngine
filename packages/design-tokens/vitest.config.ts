// Vitest config for @zapengine/design-tokens.
//
// This package is pure codegen from tokens.json and has no behavioural tests —
// `passWithNoTests` lets `test:ci` (vitest run --coverage) succeed with an empty
// suite instead of failing on "no test files found". Drop this once real tests
// for the codegen are added.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
  },
});
