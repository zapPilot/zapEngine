import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { VoManifest } from '../../src/timeline/manifest';
import type {
  Storyboard,
  VoiceSettings,
  VoLine,
} from '../../src/timeline/types';
import { publicDir as defaultPublicDir } from './paths';
import {
  ASSEMBLY_VERSION,
  BRAND_CLIPS,
  type BrandClip,
  planSpeech,
  SPLICE_KEEP_S,
} from './speech-plan';

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

/**
 * What is spoken and how. A manifest entry whose fingerprint differs from the
 * storyboard line is stale: the words or the voice settings changed.
 */
export interface FingerprintContext {
  publicDir?: string;
  clips?: Record<string, BrandClip>;
  digest?: (file: string) => string;
  keep?: number;
  assemblyVersion?: number;
}
export function fileDigest(file: string): string {
  try {
    return createHash('sha256').update(readFileSync(file)).digest('hex');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new Error(
        `Missing brand asset ${file}; run pnpm video:brand-audio kokode --pick N after human approval`,
      );
    throw error;
  }
}
export function lineFingerprint(
  line: VoLine,
  voice: VoiceSettings,
  context: FingerprintContext = {},
): string {
  const say = line.say ?? line.text;
  const plan = planSpeech(say, voice, context.clips ?? BRAND_CLIPS);
  const payload: Record<string, unknown> = {
    say,
    speed: voice.speed,
    voice: voice.voice,
  };
  if (plan.some((part) => part.kind === 'clip')) {
    payload['splice'] = {
      keep: context.keep ?? SPLICE_KEEP_S,
      assemblyVersion: context.assemblyVersion ?? ASSEMBLY_VERSION,
      parts: plan.map((part) =>
        part.kind === 'clip'
          ? {
              kind: 'clip',
              sha256: (context.digest ?? fileDigest)(
                path.join(
                  context.publicDir ?? defaultPublicDir,
                  part.clip.file,
                ),
              ),
              gainDb: part.clip.gainDb,
            }
          : part,
      ),
    };
  }
  return sha256(JSON.stringify(payload)).slice(0, 16);
}

/** Identifies the engine and public preset voice. */
export function voiceKey(engine: string, referenceId: string): string {
  return sha256(`${engine}\u0000${referenceId}`).slice(0, 12);
}

/** Cache file name; any change to words, settings or voice is a new file. */
export function clipFileName(fingerprint: string, key: string): string {
  return `${sha256(`${key}:${fingerprint}`).slice(0, 16)}.mp3`;
}

/** Storyboard lines the manifest cannot serve as-is. */
export function staleLines(
  storyboard: Storyboard,
  manifest: VoManifest,
  context?: FingerprintContext,
): string[] {
  return storyboard.scenes
    .flatMap((scene) => scene.vo)
    .filter(
      (line) =>
        manifest.lines[line.id]?.fingerprint !==
        lineFingerprint(line, storyboard.voice, context),
    )
    .map((line) => line.id);
}

/** Manifest entries for lines that no longer exist in the storyboard. */
export function droppedLines(
  storyboard: Storyboard,
  manifest: VoManifest,
): string[] {
  const live = new Set(
    storyboard.scenes.flatMap((scene) => scene.vo.map((line) => line.id)),
  );
  return Object.keys(manifest.lines).filter((id) => !live.has(id));
}

/** Files in a voice folder that no manifest entry points at. */
export function orphanFiles(
  files: readonly string[],
  manifest: VoManifest,
  folder: string,
): string[] {
  const used = new Set(Object.values(manifest.lines).map((clip) => clip.file));
  return files.filter(
    (file) => file.endsWith('.mp3') && !used.has(`${folder}/${file}`),
  );
}

/** Manifest clips unavailable on this machine (generated audio is ignored). */
export function missingClips(
  manifest: VoManifest,
  publicDir: string,
  exists: (file: string) => boolean = existsSync,
): string[] {
  return Object.entries(manifest.lines)
    .filter(([, clip]) => !exists(path.join(publicDir, clip.file)))
    .map(([id]) => id);
}

/** Fail before bundling with an actionable error for a clean checkout. */
export function requireNarration(
  storyboard: Storyboard,
  manifest: VoManifest,
  publicDir: string,
): void {
  const missing = [
    ...new Set([
      ...staleLines(storyboard, manifest, { publicDir }),
      ...missingClips(manifest, publicDir),
    ]),
  ];
  if (missing.length > 0)
    throw new Error(
      `Narration missing or stale for ${missing.join(', ')}; run pnpm voiceover ${storyboard.id} first.`,
    );
}
