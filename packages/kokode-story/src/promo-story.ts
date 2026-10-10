import { storyFor } from './localized.js';
import type { Locale } from './locales.js';
import { PROMO_ORDER, type PromoSceneId } from './narrative.js';
import { PROMO, type PromoScene } from './promo.js';
import {
  beatCopy,
  footnotes,
  narration,
  type NarrationLine,
  screenCopy,
  sequenceBeats,
} from './projection.js';

export type { PromoBeatId, PromoSceneId } from './narrative.js';
export type { NarrationLine } from './projection.js';

/** A promo scene as the renderer reads it. */
export type PromoStoryScene = Omit<PromoScene, 'lines'> & {
  readonly lines: readonly NarrationLine[];
};

const beatIds = sequenceBeats(PROMO_ORDER);

/** Plain data shared by the promo renderer and its release fingerprint. */
export function promoStory(locale: Locale) {
  const story = storyFor(locale);
  const scenes = {} as { -readonly [Id in PromoSceneId]: PromoStoryScene };
  for (const { id } of PROMO_ORDER) {
    scenes[id] = { ...PROMO[id], lines: narration(PROMO[id].lines, locale) };
  }
  return {
    PROMO: scenes as { readonly [Id in PromoSceneId]: PromoStoryScene },
    PROMO_ORDER,
    PROMO_LINK: story.PROMO_LINK,
    PROMO_UI: story.PROMO_UI,
    BEATS: beatCopy(story, beatIds, ['title', 'eyebrow', 'action']),
    ...screenCopy(story),
    FOOTNOTES: footnotes(story, PROMO),
  };
}
