import { cueOffset } from './captions';
import type { Beat, TimedScene } from './timeline';

/** The narration beat for `lineId` inside `scene`. */
export function beatOf(scene: TimedScene, lineId: string): Beat {
  const beat = scene.beats.find((candidate) => candidate.line.id === lineId);
  if (beat === undefined) {
    throw new Error(`Scene "${scene.spec.id}" has no line "${lineId}".`);
  }
  return beat;
}

/** Scene-relative frame at which `marker` is spoken in line `lineId`. */
export function cueFrame(
  scene: TimedScene,
  lineId: string,
  marker: string,
): number {
  const beat = beatOf(scene, lineId);
  return (
    beat.from + cueOffset(beat.line.text, marker, beat.durationInFrames)
  );
}
