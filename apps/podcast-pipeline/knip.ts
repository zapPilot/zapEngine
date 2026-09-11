import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  project: ['src/**/*.{ts,tsx}'],
  // Fly process-group/preload commands only: reached by `node --import`
  // rather than by an import or a package.json script, so knip's own
  // reachability tracing has nothing to follow them from. Every other
  // Fly entry point and CLI is already a package.json script and needs no
  // explicit listing here.
  entry: [
    // Preloaded by the app process (`node --import ./dist/release-heartbeat.js`
    // in fly.toml), so nothing ever imports it.
    'src/release-heartbeat.ts',
    // Also preloaded by the app process to run durable completion retries.
    'src/services/video-completion-notifier-autostart.ts',
  ],
  ignoreDependencies: [
    // Pre-existing: loaded via CSS @import; knip only resolves JS imports
    '@zapengine/design-tokens',
    // Imported only through the `./shared` subpath, which knip cannot trace
    // back from the package's `exports` map to source. Same reason it is listed
    // in apps/control-center and apps/account-engine.
    '@zapengine/types',
  ],
  vitest: {
    config: ['vitest.config.ts'],
    entry: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
