/**
 * pnpm video:voiceover <video-id> [--prune] [--dry-run]
 *
 * Synthesises English narration with the declared Fish Official preset voice. Lines
 * are cached by content hash, so only edited lines cost a request. Each clip
 * is trimmed to its speech and loudness-normalised to −16 LUFS, then measured;
 * the durations in vo.manifest.json drive the whole timeline.
 *
 * Needs FISH_AUDIO_API_KEY (FISH_AUDIO_ENGINE is
 * optional), so run it through the env runner from the repo root:
 *   pnpm video:voiceover calculator-pitch
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
import { buildTimeline, readingRates } from '../src/timeline/timeline';
import type { VoLine } from '../src/timeline/types';
import { captionLangs, captionVersion } from '../src/timeline/versions';
import { VOICES } from '../src/timeline/voices';
import { getVideo, videoIds } from '../src/videos/catalog';
import { cliArgs, requireVideoId } from './lib/args';
import { verifyBrandAsset } from './lib/brand-asset';
import { resolveEngine, synthesize } from './lib/fish-audio';
import { mediaDuration } from './lib/media';
import { publicDir, videoPaths } from './lib/paths';
import { synthesizeLine } from './lib/speech-assemble';
import { planSpeech } from './lib/speech-plan';
import {
  clipFileName,
  droppedLines,
  lineFingerprint,
  missingClips,
  orphanFiles,
  staleLines,
  voiceKey,
} from './lib/vo-cache';

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

/** CJK caption versions: how fast each line asks the viewer to read. */
function printReadingRates(manifest: VoManifest): void {
  for (const lang of captionLangs(storyboard)) {
    const version = captionVersion(storyboard, lang);
    const rates = readingRates(version, buildTimeline(version, manifest));
    if (rates.length === 0) continue;
    console.log(
      `  ${lang} reading speed (target ≤ ${JA_TARGET_CPS} cps, limit ${JA_MAX_CPS} cps)`,
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
}

async function main() {
  const previous = await readManifest();
  const stale = new Set([
    ...staleLines(storyboard, previous),
    ...missingClips(previous, publicDir),
  ]);
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
    printReadingRates({
      ...previous,
      lines: Object.fromEntries(current),
    });
    return;
  }

  const apiKey = process.env['FISH_AUDIO_API_KEY']?.trim();
  const referenceId = VOICES[storyboard.voice.voice].id;
  const engine = resolveEngine(process.env);
  if (!apiKey) {
    if (stale.size === 0 && dropped.length === 0) return;
    throw new Error(
      'FISH_AUDIO_API_KEY is required; run through `node scripts/env/run.mjs --`.',
    );
  }

  for (const line of storyboard.scenes.flatMap((scene) => scene.vo)) {
    for (const part of planSpeech(line.say ?? line.text, storyboard.voice)) {
      if (part.kind === 'clip') verifyBrandAsset(part.clip, publicDir, engine);
    }
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
        const plan = planSpeech(line.say ?? line.text, storyboard.voice);
        await synthesizeLine(plan, {
          scratch,
          target,
          publicDir,
          synthesize: (text) =>
            synthesize({
              apiKey,
              referenceId,
              engine,
              text,
              speed: storyboard.voice.speed,
            }),
        });
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
  printReadingRates(manifest);
  if (seconds > storyboard.maxSeconds) {
    throw new Error(
      `Over the ${storyboard.maxSeconds}s limit; shorten the script.`,
    );
  }
}

await main();
