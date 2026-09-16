import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/release/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json', 'html'],
      // Only the pure, injectable modules are unit-testable; Electron-host
      // wiring (main/window/tray) is exercised by the manual package gate.
      include: [
        'src/shared/**',
        'src/main/appProtocol.ts',
        'src/main/config.ts',
        'src/main/scheduler/**',
      ],
      // Pure resolver, runtime-config, IPC, and scheduler boundaries are
      // exhaustively covered. Keep every dimension pinned at 100%.
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
      exclude: ['**/*.test.ts', '**/node_modules/**', '**/dist/**'],
    },
  },
});
