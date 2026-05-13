import { cpSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(process.execPath, [join(appDir, 'scripts/check-site.mjs')], {
  cwd: appDir,
  stdio: 'inherit',
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const outDir = join(appDir, 'out');
rmSync(outDir, { force: true, recursive: true });
cpSync(join(appDir, 'site'), outDir, { recursive: true });

console.log('Pitch deck static artifact written to out/.');
