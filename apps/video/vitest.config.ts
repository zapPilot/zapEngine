import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    exclude: ['build/**', 'out/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      // The measured denominator is the logic that decides what the video
      // says and when: timeline, captions, camera maths, facts, capture
      // checks and the narration cache. React scenes and the Remotion,
      // Playwright and Fish Audio entry scripts are verified by rendering
      // (`pnpm stills`, `pnpm render`) and by the capture assertions instead.
      include: [
        'src/timeline/**/*.ts',
        'src/captures/**/*.ts',
        'src/primitives/*.ts',
        'src/brand/{easing,tokens}.ts',
        'src/videos/{catalog,metadata}.ts',
        'src/videos/*/{assets,facts,shots,storyboard,theme}.ts',
        'scripts/lib/**/*.ts',
      ],
      exclude: ['**/*.test.ts', 'scripts/lib/bundle.ts'],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
