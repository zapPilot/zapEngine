import { bridgeGaps, spanPhrases, splitCaptionPhrases } from './captions';
import type { VoManifest } from './manifest';
import type { SceneSpec, Storyboard, VoLine } from './types';

/** Speaking rate used to size a line that has no narration yet. */
export const ESTIMATED_CHARS_PER_SECOND = 15;

/** Pauses up to this long keep the previous caption on screen. */
const CAPTION_HOLD_FRAMES = 15;

export type Beat = {
  readonly line: VoLine;
  /** Narration file below `public/`, or null while the line is estimated. */
  readonly file: string | null;
  /** Frame relative to the scene start. */
  readonly from: number;
  readonly durationInFrames: number;
};

export type TimedScene<Scene extends SceneSpec = SceneSpec> = {
  readonly spec: Scene;
  /** Absolute start frame; consecutive scenes overlap by the transition. */
  readonly from: number;
  readonly durationInFrames: number;
  readonly beats: readonly Beat[];
};

export type VoicePlacement = {
  readonly lineId: string;
  readonly file: string;
  readonly from: number;
  readonly durationInFrames: number;
};

export type CaptionCue = {
  readonly text: string;
  readonly from: number;
  readonly to: number;
};

export type Timeline<Scene extends SceneSpec = SceneSpec> = {
  readonly durationInFrames: number;
  readonly scenes: readonly TimedScene<Scene>[];
  /** Narration on the composition's absolute clock, unaffected by transitions. */
  readonly voice: readonly VoicePlacement[];
  readonly captions: readonly CaptionCue[];
  /** Lines sized by estimate because `pnpm voiceover` has not produced them. */
  readonly estimatedLines: readonly string[];
};

function assertUniqueLineIds(scenes: readonly SceneSpec[]): void {
  const seen = new Set<string>();
  for (const line of scenes.flatMap((scene) => scene.vo)) {
    if (seen.has(line.id)) {
      throw new Error(`Duplicate voiceover line id "${line.id}".`);
    }
    seen.add(line.id);
  }
}

function assertNoOverlap(voice: readonly VoicePlacement[]): void {
  voice.slice(1).forEach((clip, index) => {
    const previous = voice[index] as VoicePlacement;
    if (clip.from < previous.from + previous.durationInFrames) {
      throw new Error(
        `Narration "${clip.lineId}" starts before "${previous.lineId}" ends; raise leadIn/tail above the transition.`,
      );
    }
  });
}

/**
 * Lays the storyboard on a frame clock. Scene length follows its narration
 * (lead-in + lines + gaps + tail), so editing a sentence re-times everything
 * after it; nothing else in the video hard-codes a frame number.
 */
export function buildTimeline<Scene extends SceneSpec>(
  storyboard: Storyboard<Scene>,
  manifest: VoManifest,
): Timeline<Scene> {
  assertUniqueLineIds(storyboard.scenes);
  const { fps, transitionFrames } = storyboard;
  const scenes: TimedScene<Scene>[] = [];
  const voice: VoicePlacement[] = [];
  const captions: CaptionCue[] = [];
  const estimatedLines: string[] = [];
  let sceneStart = 0;

  storyboard.scenes.forEach((spec, index) => {
    const beats: Beat[] = [];
    let cursor = spec.leadIn ?? storyboard.leadIn;
    spec.vo.forEach((line, lineIndex) => {
      const clip = manifest.lines[line.id];
      const seconds =
        clip?.durationSeconds ??
        (line.say ?? line.text).length / ESTIMATED_CHARS_PER_SECOND;
      const durationInFrames = Math.ceil(seconds * fps);
      if (clip === undefined) estimatedLines.push(line.id);
      beats.push({
        line,
        file: clip?.file ?? null,
        from: cursor,
        durationInFrames,
      });
      cursor += durationInFrames;
      if (lineIndex < spec.vo.length - 1) cursor += storyboard.gap;
    });

    const durationInFrames = Math.max(
      cursor + (spec.tail ?? storyboard.tail),
      spec.minFrames ?? 0,
      transitionFrames * 2,
    );
    scenes.push({ spec, from: sceneStart, durationInFrames, beats });

    for (const beat of beats) {
      const from = sceneStart + beat.from;
      if (beat.file !== null) {
        voice.push({
          lineId: beat.line.id,
          file: beat.file,
          from,
          durationInFrames: beat.durationInFrames,
        });
      }
      const phrases = splitCaptionPhrases(beat.line.text);
      spanPhrases(phrases, from, beat.durationInFrames).forEach((span, i) =>
        captions.push({ text: phrases[i] as string, ...span }),
      );
    }

    const isLast = index === storyboard.scenes.length - 1;
    sceneStart += durationInFrames - (isLast ? 0 : transitionFrames);
  });

  assertNoOverlap(voice);
  return {
    durationInFrames: sceneStart,
    scenes,
    voice,
    captions: bridgeGaps(captions, CAPTION_HOLD_FRAMES),
    estimatedLines,
  };
}
