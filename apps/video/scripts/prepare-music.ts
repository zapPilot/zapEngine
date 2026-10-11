import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { musicLoop } from '../src/music/library';
import { parseVoManifest } from '../src/timeline/manifest';
import { buildTimeline } from '../src/timeline/timeline';
import { getVideo, videoIds } from '../src/videos/catalog';
import { decodePcm, previewBed } from './lib/loop-job';
import { publicDir, videoPaths } from './lib/paths';
import { writeSfx } from './lib/sfx';
import { writeWav } from './lib/wav';

let effects: Promise<void> | undefined;

/**
 * The real-song spike failed the frame-step envelope check: prepare smooth PCM
 * beds. The synthesised sound effects every video shares are written once.
 */
export async function prepareMusic(id: string): Promise<void> {
  effects ??= writeSfx(publicDir);
  await effects;
  const { storyboard } = getVideo(id);
  const loop = musicLoop(storyboard.music.loop);
  const paths = videoPaths(id);
  await mkdir(paths.work, { recursive: true });
  const manifest = parseVoManifest(
    JSON.parse(await readFile(paths.voManifest, 'utf8')),
  );
  const duration = buildTimeline(storyboard, manifest).durationInFrames;
  const pcm = await decodePcm(
    path.join(publicDir, 'music', `${loop.id}.mp3`),
    path.join(paths.work, 'music-clip.wav'),
  );
  const bed = previewBed(
    pcm,
    loop.periodSamples / 1600,
    loop.crossfadeSamples / 1600,
    loop.rho,
    duration,
  );
  await mkdir(path.join(publicDir, 'music/beds'), { recursive: true });
  await writeFile(
    path.join(publicDir, 'music/beds', `${loop.id}-${duration}.wav`),
    writeWav(bed),
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  for (const id of videoIds) await prepareMusic(id);
