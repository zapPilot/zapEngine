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
    // Package.json-script CLIs with no importing test: `sentry:smoke` and
    // `video:slide:preview`. Every other CLI is imported by its co-located
    // test, which is how knip reaches it; these two have none, so list them
    // here rather than letting them read as unused files.
    'src/observability/sentry-smoke.ts',
    'src/services/video/slide-preview-cli.ts',
  ],
  // Consumed only through the `/tokens` subpath in
  // src/services/video/templates.tsx. That subpath resolves into the package's
  // dist output, so knip never credits the direct dependency.
  ignoreDependencies: ['@zapengine/design-tokens'],
  vitest: { config: ['vitest.config.ts'] },
});
