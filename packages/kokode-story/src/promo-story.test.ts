import { describe, expect, it } from 'vitest';

import { LOCALES } from './locales.js';
import { storyFor } from './localized.js';
import { PROMO_ORDER } from './narrative.js';
import { PROMO } from './promo.js';
import { promoStory } from './promo-story.js';

describe('promoStory', () => {
  it.each(LOCALES)('projects the %s story for the promo renderer', (locale) => {
    const story = storyFor(locale);
    const projected = promoStory(locale);

    expect(Object.keys(projected.PROMO)).toEqual(
      PROMO_ORDER.map((scene) => scene.id),
    );
    expect(projected.PROMO_ORDER).toBe(PROMO_ORDER);
    expect(projected.PROMO_LINK).toBe(story.PROMO_LINK);
    expect(projected.PROMO_LINK).toContain('utm_campaign=kokode-promo');
    expect(projected.PROMO_LINK).not.toBe(story.FILM_LINK);
    expect(projected.PROMO_UI).toBe(story.PROMO_UI);

    for (const { id } of PROMO_ORDER) {
      const scene = PROMO[id];
      expect(projected.PROMO[id].notes).toBe(scene.notes);
      expect(projected.PROMO[id].lines).toEqual(
        scene.lines.map((line) => ({
          id: line.id,
          en: line.en,
          caption: { ja: line.ja, en: line.en, 'zh-Hant': line['zh-Hant'] }[
            locale
          ],
        })),
      );
    }

    for (const group of PROMO_ORDER) {
      for (const beat of group.beats) {
        const source = story.BEATS[beat];
        expect(projected.BEATS[beat].title).toEqual(source.title);
        expect(projected.BEATS[beat].eyebrow).toBe(source.eyebrow);
        expect(projected.BEATS[beat].action).toEqual(source.action);
      }
    }
    expect(projected.BEATS.hero.action?.label).toBeTruthy();

    for (const scene of Object.values(PROMO)) {
      for (const note of scene.notes) {
        expect(projected.FOOTNOTES[note]).toBe(story.footnote(note));
      }
    }
    expect(projected.DEMOS.patient.reply).toEqual(story.DEMOS.patient.reply);
    expect(projected.FIGURES.turnkey.layers).toEqual(
      story.FIGURES.turnkey.layers,
    );
  });
});
