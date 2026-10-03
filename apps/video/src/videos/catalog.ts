import type { ShotSet } from '../captures/types';
import type { Storyboard } from '../timeline/types';
import { shots as calculatorShots } from './calculator-pitch/shots';
import { storyboard as calculatorStoryboard } from './calculator-pitch/storyboard';

type VideoEntry = {
  readonly storyboard: Storyboard;
  readonly shots: ShotSet;
};

/**
 * Data-only registry the scripts use (no React here, so Node can import it).
 * Each video owns `src/videos/<id>/` and `public/{vo,captures}/<id>/`.
 */
const catalog: Readonly<Record<string, VideoEntry>> = {
  'calculator-pitch': {
    storyboard: calculatorStoryboard,
    shots: calculatorShots,
  },
};

export const videoIds = Object.keys(catalog);

export function getVideo(id: string): VideoEntry {
  const entry = catalog[id];
  if (entry === undefined) {
    throw new Error(`Unknown video "${id}". Known: ${videoIds.join(', ')}`);
  }
  return entry;
}
