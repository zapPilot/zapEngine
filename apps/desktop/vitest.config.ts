import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    watch: false,
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/release/**'],
    coverage: {
      provider: 'v8',
      // Only the pure, injectable modules are unit-testable; Electron-host
      // wiring (main/window/tray) is exercised by the manual package gate.
      include: [
        'src/shared/**',
        'src/main/appProtocol.ts',
        'src/main/config.ts',
        'src/main/scheduler/**',
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
      exclude: ['**/*.test.ts', '**/node_modules/**', '**/dist/**'],
    },
  },
});
