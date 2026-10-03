import { execFile } from 'node:child_process';
import path from 'node:path';

import { ALL_FORMATS, FilePathSource, Input } from 'mediabunny';

import { workspaceRoot } from './paths';

const REMOTION_BIN = path.join(workspaceRoot, 'node_modules', '.bin', 'remotion');

/**
 * Runs the ffmpeg Remotion ships with (the renderer's own build), so audio
 * processing does not depend on whatever ffmpeg the machine has. Resolves
 * with stderr, where ffmpeg writes its filter reports.
 */
export function ffmpeg(args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      REMOTION_BIN,
      ['ffmpeg', '-hide_banner', '-nostats', ...args],
      { maxBuffer: 64 * 1024 * 1024 },
      (error, _stdout, stderr) => {
        if (error === null) resolve(stderr);
        else reject(new Error(`ffmpeg ${args.join(' ')}\n${stderr.slice(-1200)}`));
      },
    );
  });
}

/** Media duration in seconds, read from the container with Mediabunny. */
export async function mediaDuration(file: string): Promise<number> {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new FilePathSource(file),
  });
  try {
    return await input.computeDuration();
  } finally {
    input.dispose();
  }
}
