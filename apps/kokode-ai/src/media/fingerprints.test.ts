import { expect, it } from 'vitest';
import { FILM } from '../story/film';
import { storyFor } from '../story/localized';
import { expectedFingerprints } from './fingerprints';
function changedBy(target: object, key: string, value: unknown): string[] {
  const before = expectedFingerprints(),
    descriptor = Object.getOwnPropertyDescriptor(target, key)!;
  try {
    Object.defineProperty(target, key, { ...descriptor, value });
    const after = expectedFingerprints();
    return Object.keys(before)
      .filter((id) => before[id] !== after[id])
      .sort();
  } finally {
    Object.defineProperty(target, key, descriptor);
  }
}
it('English narration edits stale only films and posters across all locales', () => {
  expect(
    changedBy(FILM.turn.lines[0]!, 'en', `${FILM.turn.lines[0]!.en} changed`),
  ).toEqual([
    'film.en',
    'film.ja',
    'film.zh-Hant',
    'poster.en',
    'poster.ja',
    'poster.zh-Hant',
  ]);
});
it('a partner-only beat stales only that locale partner deck', () => {
  const beat = storyFor('ja').BEATS.partnerDemand;
  expect(changedBy(beat, 'title', [...beat.title, 'changed'])).toEqual([
    'partnerDeck.ja',
  ]);
});
it('landing form copy does not stale any sales artifacts', () => {
  const form = storyFor('ja').FORM;
  expect(changedBy(form, 'submit', `${form.submit} changed`)).toEqual([]);
});
