import { type CapturedShot, parseCaptureManifest } from '../../captures/manifest';
import { parseVoManifest } from '../../timeline/manifest';
import { buildTimeline, type TimedScene } from '../../timeline/timeline';
import capturesJson from './captures.json';
import type { ShotId } from './shots';
import { type CalculatorScene, storyboard } from './storyboard';
import voJson from './vo.manifest.json';

const captures = parseCaptureManifest(capturesJson);

export const timeline = buildTimeline<CalculatorScene>(
  storyboard,
  parseVoManifest(voJson),
);

/** A capture from `pnpm capture calculator-pitch`, by shot id. */
export function shot(id: ShotId): CapturedShot {
  const captured = captures.shots[id];
  if (captured === undefined) {
    throw new Error(`Missing capture "${id}"; run pnpm capture calculator-pitch.`);
  }
  return captured;
}

/** A value a capture check recorded, e.g. the block the codehash was checked at. */
export function recorded(id: ShotId, name: string): string {
  const value = shot(id).values[name];
  if (value === undefined) {
    throw new Error(`Capture "${id}" recorded no "${name}".`);
  }
  return value;
}

export type SceneOf<Id extends CalculatorScene['id']> = TimedScene<
  Extract<CalculatorScene, { id: Id }>
>;
