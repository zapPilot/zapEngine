/** Refresh cached narration, then render every caption language. */
import { spawn } from 'node:child_process';
import path from 'node:path';

import { videoIds } from '../src/videos/catalog';
import { cliArgs, requireVideoId } from './lib/args';
import { workspaceRoot } from './lib/paths';

const { positionals } = cliArgs(process.argv.slice(2), {});
const videoId = requireVideoId(positionals, videoIds);

for (const script of ['voiceover', 'render']) {
  const code = await new Promise<number>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        '--import',
        'tsx',
        path.join(workspaceRoot, 'scripts', `${script}.ts`),
        videoId,
      ],
      {
        cwd: workspaceRoot,
        stdio: 'inherit',
        env: process.env,
      },
    );
    child.once('error', reject);
    child.once('exit', (exitCode, signal) => {
      if (signal !== null) reject(new Error(`${script} stopped by ${signal}`));
      else resolve(exitCode ?? 1);
    });
  });
  if (code !== 0) process.exit(code);
}
