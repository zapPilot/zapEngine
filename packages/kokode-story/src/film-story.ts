import { FILM } from './film.js';
import { FILM_ORDER, type FilmBeatId } from './narrative.js';
import { storyFor } from './localized.js';
import type { Locale } from './locales.js';
import type { BeatId } from './types.js';

export type { FilmBeatId } from './narrative.js';
const beatIds = [
  ...new Set<FilmBeatId>(FILM_ORDER.flatMap((group) => [...group.beats])),
];
const pick = <T, K extends keyof T>(value: T, keys: readonly K[]): Pick<T, K> =>
  Object.fromEntries(
    keys
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, value[key]]),
  ) as Pick<T, K>;
/** Plain data shared by the renderer and the release fingerprint. */
export function filmStory(locale: Locale) {
  const story = storyFor(locale);
  const films = Object.fromEntries(
    Object.entries(FILM).map(([id, scene]) => [
      id,
      {
        ...scene,
        lines: scene.lines.map(({ ja, en, 'zh-Hant': zh, ...rest }) => ({
          ...rest,
          en,
          caption: { ja, en, 'zh-Hant': zh }[locale],
        })),
      },
    ]),
  );
  return {
    FILM: films,
    FILM_ORDER,
    FILM_LINK: story.FILM_LINK,
    BEATS: Object.fromEntries(
      beatIds.map((id) => [id, pick(story.BEATS[id], ['title', 'eyebrow'])]),
    ) as Record<
      FilmBeatId,
      Pick<(typeof story.BEATS)[BeatId], 'title' | 'eyebrow'>
    >,
    DEMOS: {
      chat: pick(story.DEMOS.chat, ['address', 'prompt', 'reply']),
      patient: pick(story.DEMOS.patient, ['prompt', 'record', 'reply']),
      image: pick(story.DEMOS.image, ['prompt', 'sketch', 'slide', 'steps']),
    },
    CHAT_UI: pick(story.CHAT_UI, ['placeholder', 'assistant', 'cloud']),
    FIGURES: {
      beforeAfter: pick(story.FIGURES.beforeAfter, [
        'before',
        'after',
        'inside',
      ]),
      boundary: pick(story.FIGURES.boundary, [
        'inside',
        'network',
        'devices',
        'login',
        'server',
        'guest',
        'outside',
        'blocked',
      ]),
      turnkey: pick(story.FIGURES.turnkey, ['layers']),
    },
    SITE: pick(story.SITE, ['name']),
    FOOTNOTES: Object.fromEntries(
      [
        ...new Set(Object.values(FILM).flatMap((scene) => [...scene.notes])),
      ].map((id) => [id, story.footnote(id)]),
    ),
  };
}
