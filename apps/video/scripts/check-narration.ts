/**
 * pnpm check <video-id>
 *
 * Read-only freshness gate for `pnpm sales:render`. Exit 0 when the
 * narration manifest is fresh and complete and the declared BGM exists.
 * Exit 2 with an actionable message otherwise. No network, no paid APIs,
 * no Infisical: safe to run on a clean checkout with no credentials.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parseVoManifest } from '../src/timeline/manifest';
import { getVideo, videoIds } from '../src/videos/catalog';
import { cliArgs, requireVideoId } from './lib/args';
import { publicDir, videoPaths, workspaceRoot } from './lib/paths';
import { missingClips, staleLines } from './lib/vo-cache';

const { positionals } = cliArgs(process.argv.slice(2), {});
const videoId = requireVideoId(positionals, videoIds);
const paths = videoPaths(videoId);
const { storyboard } = getVideo(videoId);

function relativeToRoot(file: string): string {
  return path.relative(workspaceRoot, file);
}

async function main(): Promise<void> {
  if (!existsSync(paths.voManifest)) {
    console.error(
      [
        `✗ ${videoId}: narration manifest is missing.`,
        '',
        'Missing input:',
        `  ${relativeToRoot(paths.voManifest)}`,
        '',
        'Run:',
        `  pnpm video:voiceover ${videoId}`,
      ].join('\n'),
    );
    process.exit(2);
  }
  const manifest = parseVoManifest(
    JSON.parse(await readFile(paths.voManifest, 'utf8')),
  );
  const problems = [
    ...new Set([
      ...staleLines(storyboard, manifest),
      ...missingClips(manifest, publicDir),
    ]),
  ];
  if (problems.length > 0) {
    console.error(
      [
        `✗ ${videoId}: narration is missing or stale for ${problems.join(', ')}.`,
        '',
        'Run:',
        `  pnpm video:voiceover ${videoId}`,
      ].join('\n'),
    );
    process.exit(2);
  }
  const music = path.join(publicDir, storyboard.music.src);
  if (!existsSync(music)) {
    console.error(
      [
        `✗ ${videoId}: BGM is missing.`,
        '',
        'Missing input:',
        `  ${relativeToRoot(music)}`,
        '',
        'Run:',
        `  pnpm video:music ${videoId}`,
      ].join('\n'),
    );
    process.exit(2);
  }
  console.log(`✓ ${videoId}: narration fresh, music present`);
}

try {
  await main();
} catch (error) {
  console.error(String(error));
  process.exitCode = 2;
}
