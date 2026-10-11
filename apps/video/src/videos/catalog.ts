import type { ShotSet } from '../captures/types';
import type { CaptionLang, Storyboard } from '../timeline/types';
import { captionLangs } from '../timeline/versions';
import { shots as calculatorShots } from './calculator-pitch/shots';
import { storyboard as calculatorStoryboard } from './calculator-pitch/storyboard';
import { filmStory } from './kokode-clinic/story';
import { storyboard as kokodeStoryboard } from './kokode-clinic/storyboard';
import { promoStory } from './kokode-promo/story';
import { storyboard as promoStoryboard } from './kokode-promo/storyboard';

interface VideoEntry {
  readonly storyboard: Storyboard;
  readonly fingerprintSource?: (lang: CaptionLang) => unknown;
  readonly captionLangs: readonly CaptionLang[];
  /** What `pnpm capture` photographs; absent when a video has no captures. */
  readonly shots?: ShotSet;
}

/**
 * Data-only registry the scripts use (no React here, so Node can import it).
 * Each video owns `src/videos/<id>/` and `public/{vo,captures}/<id>/`.
 */
const catalog: Readonly<Record<string, VideoEntry>> = {
  'calculator-pitch': {
    storyboard: calculatorStoryboard,
    captionLangs: captionLangs(calculatorStoryboard),
    shots: calculatorShots,
  },
  // Kokode is a separate product; its film is drawn, not captured.
  'kokode-clinic': {
    storyboard: kokodeStoryboard,
    fingerprintSource: filmStory,
    captionLangs: captionLangs(kokodeStoryboard),
  },
  // The Kokode promo: drawn too, from the same story.
  'kokode-promo': {
    storyboard: promoStoryboard,
    fingerprintSource: promoStory,
    captionLangs: captionLangs(promoStoryboard),
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

/** The shot list `pnpm capture` runs for a video. */
export function getShots(id: string): ShotSet {
  const { shots } = getVideo(id);
  if (shots === undefined) {
    throw new Error(`Video "${id}" has no shots to capture.`);
  }
  return shots;
}
