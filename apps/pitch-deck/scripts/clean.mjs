import { rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

rmSync(join(appDir, 'out'), { force: true, recursive: true });
console.log('Removed pitch-deck out/.');
