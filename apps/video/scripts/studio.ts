import { spawn } from 'node:child_process';
import path from 'node:path';

import { videoIds } from '../src/videos/catalog';
import { prepareMusic } from './prepare-music';

for (const id of videoIds) await prepareMusic(id);
const child = spawn(
  path.resolve(import.meta.dirname, '../node_modules/.bin/remotion'),
  ['studio', 'src/index.ts'],
  {
    stdio: 'inherit',
  },
);
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
