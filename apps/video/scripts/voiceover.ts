/**
 * pnpm voiceover <video-id> [--prune] [--dry-run]
 *
 * Synthesises storyboard narration with the podcast's Fish Audio voice. Lines
 * are cached by content hash, so only edited lines cost a request. Each clip
 * is trimmed to its speech and loudness-normalised to −16 LUFS, then measured;
 * the durations in vo.manifest.json drive the whole timeline.
 *
 * Needs FISH_AUDIO_API_KEY and FISH_AUDIO_REFERENCE_ID (FISH_AUDIO_ENGINE is
 * optional), so run it through the env runner from the repo root:
 *   node scripts/env/run.mjs -- pnpm --filter @zapengine/video voiceover calculator-pitch
 */
import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { JA_MAX_CPS, JA_TARGET_CPS } from '../src/timeline/cjk';
import {
  parseVoManifest,
  type VoClip,
  type VoManifest,
} from '../src/timeline/manifest';
import {
  buildTimeline,
  readingRates,
  type Timeline,
} from '../src/timeline/timeline';
import type { VoLine } from '../src/timeline/types';
import { getVideo, videoIds } from '../src/videos/catalog';
import { cliArgs, requireVideoId } from './lib/args';
import { loudnormFilter, parseLoudnorm, speechBounds } from './lib/audio';
import { synthesize } from './lib/fish-audio';
import { ffmpeg, mediaDuration } from './lib/media';
import { publicDir, videoPaths } from './lib/paths';
import {
  clipFileName,
  droppedLines,
  lineFingerprint,
  orphanFiles,
  staleLines,
  voiceKey,
} from './lib/vo-cache';

const DEFAULT_ENGINE = 's2-pro';

const { values, positionals } = cliArgs(process.argv.slice(2), {
  prune: { type: 'boolean', default: false },
  'dry-run': { type: 'boolean', default: false },
});
const videoId = requireVideoId(positionals, videoIds);
const { storyboard } = getVideo(videoId);
const paths = videoPaths(videoId);

async function readManifest(): Promise<VoManifest> {
  if (!existsSync(paths.voManifest)) {
    return { videoId, engine: '', voiceKey: '', lines: {} };
  }
  return parseVoManifest(JSON.parse(await readFile(paths.voManifest, 'utf8')));
}

/** Raw TTS bytes → speech-trimmed, −16 LUFS MP3 at `target`. */
async function master(raw: string, target: string): Promise<void> {
  const seconds = await mediaDuration(raw);
  const silence = await ffmpeg([
    '-i',
    raw,
    '-af',
    'silencedetect=noise=-45dB:d=0.08',
    '-f',
    'null',
    '-',
  ]);
  const { start, end } = speechBounds(silence, seconds);
  const trim = `atrim=start=${start.toFixed(3)}:end=${end.toFixed(3)},asetpts=PTS-STARTPTS`;
  const measured = parseLoudnorm(
    await ffmpeg([
      '-i',
      raw,
      '-af',
      `${trim},${loudnormFilter()}`,
      '-f',
      'null',
      '-',
    ]),
  );
  await ffmpeg([
    '-y',
    '-i',
    raw,
    '-af',
    `${trim},${loudnormFilter(measured)}`,
    '-ar',
    '48000',
    '-ac',
    '1',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '192k',
    target,
  ]);
}

/** Japanese captions only: how fast each line asks the viewer to read. */
function printReadingRates(timeline: Timeline): void {
  const rates = readingRates(storyboard, timeline);
  if (rates.length === 0) return;
  console.log(
    `  reading speed (target ≤ ${JA_TARGET_CPS} cps, limit ${JA_MAX_CPS} cps)`,
  );
  for (const rate of rates) {
    const flag =
      rate.cps > JA_MAX_CPS
        ? '  over limit'
        : rate.cps > JA_TARGET_CPS
          ? '  dense'
          : '';
    console.log(
      `  ${rate.lineId.padEnd(18)} ${rate.units} units / ${rate.seconds.toFixed(2)}s = ${rate.cps.toFixed(1)} cps${flag}`,
    );
  }
}

async function main() {
  const previous = await readManifest();
  const stale = new Set(staleLines(storyboard, previous));
  const dropped = droppedLines(storyboard, previous);
  console.log(
    `${videoId}: ${stale.size} line(s) to synthesise${stale.size ? ` (${[...stale].join(', ')})` : ''}, ${dropped.length} dropped`,
  );
  if (values['dry-run']) {
    // Current clips keep their measured length; stale and missing lines are
    // estimated, as they will be re-synthesised.
    const current = Object.entries(previous.lines).filter(
      ([id]) => !stale.has(id),
    );
    printReadingRates(
      buildTimeline(storyboard, {
        ...previous,
        lines: Object.fromEntries(current),
      }),
    );
    return;
  }

  const apiKey = process.env['FISH_AUDIO_API_KEY']?.trim();
  const referenceId = process.env['FISH_AUDIO_REFERENCE_ID']?.trim();
  const engine = process.env['FISH_AUDIO_ENGINE']?.trim() || DEFAULT_ENGINE;
  if (!apiKey || !referenceId) {
    if (stale.size === 0 && dropped.length === 0) return;
    throw new Error(
      'FISH_AUDIO_API_KEY and FISH_AUDIO_REFERENCE_ID are required; run through `node scripts/env/run.mjs --`.',
    );
  }

  const key = voiceKey(engine, referenceId);
  const lines: Record<string, VoClip> = {};
  await mkdir(path.join(publicDir, paths.voPublic), { recursive: true });
  const scratch = await mkdtemp(path.join(tmpdir(), 'zap-vo-'));
  try {
    for (const line of storyboard.scenes.flatMap(
      (scene) => scene.vo,
    ) as VoLine[]) {
      const fingerprint = lineFingerprint(line, storyboard.voice);
      const file = `${paths.voPublic}/${clipFileName(fingerprint, key)}`;
      const target = path.join(publicDir, file);
      if (!existsSync(target)) {
        console.log(`  synthesise ${line.id}: ${line.say ?? line.text}`);
        const raw = path.join(scratch, `${line.id}.mp3`);
        await writeFile(
          raw,
          await synthesize({
            apiKey,
            referenceId,
            engine,
            text: line.say ?? line.text,
            speed: storyboard.voice.speed,
          }),
        );
        await master(raw, target);
      }
      const durationSeconds = Number((await mediaDuration(target)).toFixed(3));
      lines[line.id] = { file, fingerprint, durationSeconds };
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }

  const manifest: VoManifest = { videoId, engine, voiceKey: key, lines };
  await writeFile(paths.voManifest, `${JSON.stringify(manifest, null, 2)}\n`);

  if (values.prune) {
    const folder = path.join(publicDir, paths.voPublic);
    for (const orphan of orphanFiles(
      await readdir(folder),
      manifest,
      paths.voPublic,
    )) {
      await rm(path.join(folder, orphan));
      console.log(`  pruned ${orphan}`);
    }
  }

  const timeline = buildTimeline(storyboard, manifest);
  const seconds = timeline.durationInFrames / storyboard.fps;
  console.log(
    `${videoId}: ${Object.keys(lines).length} lines, ${seconds.toFixed(2)}s total (limit ${storyboard.maxSeconds}s)`,
  );
  for (const scene of timeline.scenes) {
    console.log(
      `  ${scene.spec.id.padEnd(10)} ${(scene.durationInFrames / storyboard.fps).toFixed(2)}s`,
    );
  }
  printReadingRates(timeline);
  if (seconds > storyboard.maxSeconds) {
    throw new Error(
      `Over the ${storyboard.maxSeconds}s limit; shorten the script.`,
    );
  }
}

await main();
