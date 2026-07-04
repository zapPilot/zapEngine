#!/usr/bin/env node
// Dev launcher: bundle main/preload, then start Electron.
// Renderer source:
//   ZAP_ELECTRON_DEV_URL=http://localhost:8081  -> expo dev server
//   ZAP_ELECTRON_LOOPBACK=1                     -> 127.0.0.1 static server
//   (default)                                   -> app:// serving ../app/dist/web
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import electronPath from 'electron';

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

const bundle = spawnSync(process.execPath, [join(appRoot, 'scripts/build.mjs')], {
  cwd: appRoot,
  stdio: 'inherit',
});
if (bundle.status !== 0) {
  process.exit(bundle.status ?? 1);
}

const webRoot =
  process.env.ZAP_ELECTRON_WEB_ROOT ??
  resolve(appRoot, '../app/dist/web');
if (
  !process.env.ZAP_ELECTRON_DEV_URL &&
  !existsSync(join(webRoot, 'index.html'))
) {
  console.error(
    `Missing ${join(webRoot, 'index.html')}.\n` +
      'Run `pnpm --filter @zapengine/app run build:web` first, or set ZAP_ELECTRON_DEV_URL=http://localhost:8081.',
  );
  process.exit(1);
}

const child = spawn(electronPath, ['.'], {
  cwd: appRoot,
  stdio: 'inherit',
  env: process.env,
});
child.on('exit', (code) => process.exit(code ?? 0));
