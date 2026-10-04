import { cueOffset, cueTextOf } from './captions';
import type { Beat, TimedScene } from './timeline';
import type { Storyboard } from './types';

/** The narration beat for `lineId` inside `scene`. */
export function beatOf(scene: TimedScene, lineId: string): Beat {
  const beat = scene.beats.find((candidate) => candidate.line.id === lineId);
  if (beat === undefined) {
    throw new Error(`Scene "${scene.spec.id}" has no line "${lineId}".`);
  }
  return beat;
}

const frameIn = (beat: Beat, marker: string) =>
  beat.from + cueOffset(beat.cueText, marker, beat.durationInFrames);

/** Scene-relative frame at which `marker` is spoken in line `lineId`. */
export function cueFrame(
  scene: TimedScene,
  lineId: string,
  marker: string,
): number {
  return frameIn(beatOf(scene, lineId), marker);
}

/**
 * Scene-relative frame at which `marker` is spoken, in whichever line says
 * it. The phrase must be heard in exactly one line, so a cue cannot silently
 * jump when another line starts to mention it.
 */
export function cueAt(scene: TimedScene, marker: string): number {
  const beats = scene.beats.filter((beat) => beat.cueText.includes(marker));
  const [beat] = beats;
  if (beat === undefined || beats.length > 1) {
    const lines = beats.map((candidate) => candidate.line.id).join(', ');
    throw new Error(
      `Scene "${scene.spec.id}": cue "${marker}" is spoken in ${beats.length} lines${lines ? ` (${lines})` : ''}; it must be in exactly one.`,
    );
  }
  return frameIn(beat, marker);
}

/** Every `cue` and `…Cue` string in a scene's props, at any depth. */
export function cuePhrases(props: unknown): string[] {
  if (typeof props !== 'object' || props === null) return [];
  return Object.entries(props).flatMap(([key, value]) =>
    typeof value === 'string'
      ? key === 'cue' || key.endsWith('Cue')
        ? [value]
        : []
      : cuePhrases(value),
  );
}

/**
 * Cue phrases that do not key to exactly one narrated line of their scene,
 * as `scene: "phrase"`. Empty when every visual cue is actually heard.
 */
export function unspokenCues(storyboard: Storyboard): string[] {
  return storyboard.scenes.flatMap((scene) => {
    const heard = scene.vo.map((line) => cueTextOf(line, storyboard.captions));
    return cuePhrases(scene.props)
      .filter((cue) => heard.filter((text) => text.includes(cue)).length !== 1)
      .map((cue) => `${scene.id}: "${cue}"`);
  });
}
