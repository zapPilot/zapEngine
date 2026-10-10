import type { FilmLine } from './film.js';
import type { Locale } from './locales.js';
import type { Story } from './localized.js';
import type { Beat, BeatId, DisclaimerId, Group } from './types.js';

// Shared by the film projections (film-story, promo-story): plain data the
// renderer reads and the release fingerprint hashes.

export const pick = <T, K extends keyof T>(
  value: T,
  keys: readonly K[],
): Pick<T, K> =>
  Object.fromEntries(
    keys
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, value[key]]),
  ) as Pick<T, K>;

/** Every beat a sequence shows, once, in order. */
export function sequenceBeats<Id extends BeatId>(
  order: readonly (Group & { readonly beats: readonly Id[] })[],
): Id[] {
  return [...new Set<Id>(order.flatMap((group) => [...group.beats]))];
}

/** Beat copy a film renders, keyed by beat. */
export function beatCopy<Id extends BeatId, K extends keyof Beat>(
  story: Story,
  ids: readonly Id[],
  keys: readonly K[],
): Record<Id, Pick<Beat, K>> {
  return Object.fromEntries(
    ids.map((id) => [id, pick(story.BEATS[id], keys)]),
  ) as Record<Id, Pick<Beat, K>>;
}

/** A narrated line as the renderer reads it: spoken `en`, caption per locale. */
export interface NarrationLine {
  readonly id: string;
  readonly en: string;
  readonly caption: string;
}

export function narration(
  lines: readonly FilmLine[],
  locale: Locale,
): NarrationLine[] {
  return lines.map(({ ja, en, 'zh-Hant': zh, ...rest }) => ({
    ...rest,
    en,
    caption: { ja, en, 'zh-Hant': zh }[locale],
  }));
}

/** The demo screens and diagrams both films draw. */
export function screenCopy(story: Story) {
  return {
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
  };
}

/** Localized footnote text for every note the scenes burn in. */
export function footnotes(
  story: Story,
  scenes: Readonly<Record<string, { readonly notes: readonly DisclaimerId[] }>>,
): Record<string, string> {
  return Object.fromEntries(
    [
      ...new Set(Object.values(scenes).flatMap((scene) => [...scene.notes])),
    ].map((id) => [id, story.footnote(id)]),
  );
}
