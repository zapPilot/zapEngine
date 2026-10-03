import { createHash } from 'node:crypto';

import type { VoManifest } from '../../src/timeline/manifest';
import type { Storyboard, VoiceSettings, VoLine } from '../../src/timeline/types';

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

/**
 * What is spoken and how. A manifest entry whose fingerprint differs from the
 * storyboard line is stale: the words or the voice settings changed.
 */
export function lineFingerprint(line: VoLine, voice: VoiceSettings): string {
  return sha256(
    JSON.stringify({ say: line.say ?? line.text, speed: voice.speed }),
  ).slice(0, 16);
}

/** Identifies the voice without committing the (secret) reference id. */
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
): string[] {
  return storyboard.scenes
    .flatMap((scene) => scene.vo)
    .filter(
      (line) =>
        manifest.lines[line.id]?.fingerprint !==
        lineFingerprint(line, storyboard.voice),
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
