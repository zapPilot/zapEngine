import { FILM } from './film.js';
import { FILM_ORDER } from './narrative.js';
import { storyFor } from './localized.js';
import type { Locale } from './locales.js';
import {
  beatCopy,
  footnotes,
  narration,
  screenCopy,
  sequenceBeats,
} from './projection.js';

export type { FilmBeatId } from './narrative.js';
const beatIds = sequenceBeats(FILM_ORDER);
/** Plain data shared by the renderer and the release fingerprint. */
export function filmStory(locale: Locale) {
  const story = storyFor(locale);
  const films = Object.fromEntries(
    Object.entries(FILM).map(([id, scene]) => [
      id,
      { ...scene, lines: narration(scene.lines, locale) },
    ]),
  );
  return {
    FILM: films,
    FILM_ORDER,
    FILM_LINK: story.FILM_LINK,
    BEATS: beatCopy(story, beatIds, ['title', 'eyebrow']),
    ...screenCopy(story),
    FOOTNOTES: footnotes(story, FILM),
  };
}
