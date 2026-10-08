import { describe, expect, it } from 'vitest';

import { FILM } from './film.js';
import { FILM_ORDER } from './narrative.js';
import { filmStory } from './film-story.js';
import { formatFootnote } from './footnote.js';
import {
  DEFAULT_LOCALE,
  LOCALES,
  localeFromLang,
  pagePath,
  type Locale,
} from './locales.js';
import { storyFor } from './localized.js';
import {
  DISCLAIMERS as enDisclaimers,
  footnote as enFootnote,
} from './en/disclaimers.js';
import {
  DISCLAIMERS as zhDisclaimers,
  footnote as zhFootnote,
} from './zh-Hant/disclaimers.js';

describe('filmStory', () => {
  it.each(LOCALES)('projects the %s story for the renderer', (locale) => {
    const story = storyFor(locale);
    const projected = filmStory(locale);

    expect(Object.keys(projected.FILM).sort()).toEqual(
      Object.keys(FILM).sort(),
    );
    expect(projected.FILM_ORDER).toBe(FILM_ORDER);
    expect(projected.FILM_LINK).toBe(story.FILM_LINK);

    for (const id of Object.keys(FILM)) {
      const scene = FILM[id as keyof typeof FILM];
      const projectedScene = projected.FILM[id];
      expect(projectedScene, id).toBeDefined();
      expect(
        projectedScene?.lines.map((line) => line.caption),
        id,
      ).toEqual(
        scene.lines.map(
          (line) =>
            ({ ja: line.ja, en: line.en, 'zh-Hant': line['zh-Hant'] })[locale],
        ),
      );
      expect(
        projectedScene?.lines.map((line) => line.en),
        id,
      ).toEqual(scene.lines.map((line) => line.en));
    }

    for (const group of FILM_ORDER) {
      for (const beat of group.beats) {
        expect(projected.BEATS[beat]).toEqual({
          title: story.BEATS[beat].title,
          eyebrow: story.BEATS[beat].eyebrow,
        });
      }
    }

    expect(projected.DEMOS.chat).toEqual({
      address: story.DEMOS.chat.address,
      prompt: story.DEMOS.chat.prompt,
      reply: story.DEMOS.chat.reply,
    });
    expect(projected.CHAT_UI).toEqual({
      placeholder: story.CHAT_UI.placeholder,
      assistant: story.CHAT_UI.assistant,
      cloud: story.CHAT_UI.cloud,
    });
    expect(projected.SITE).toEqual({ name: story.SITE.name });

    const noteIds = new Set(
      Object.values(FILM).flatMap((scene) => [...scene.notes]),
    );
    expect(Object.keys(projected.FOOTNOTES).sort()).toEqual(
      [...noteIds].sort(),
    );
    for (const [id, text] of Object.entries(projected.FOOTNOTES)) {
      expect(text, id).toBe(
        story.footnote(id as Parameters<typeof story.footnote>[0]),
      );
    }
  });
});

describe('locale helpers', () => {
  it('resolves every locale and falls back to the default', () => {
    for (const locale of LOCALES) {
      expect(localeFromLang(locale)).toBe(locale);
    }
    expect(localeFromLang('unknown')).toBe(DEFAULT_LOCALE);
    expect(localeFromLang('')).toBe(DEFAULT_LOCALE);
  });

  it.each(LOCALES)('builds page paths for %s', (locale: Locale) => {
    const prefix = locale === 'ja' ? '/' : locale === 'en' ? '/en/' : '/zh/';
    expect(pagePath('landing', locale)).toBe(prefix);
    expect(pagePath('pitch', locale)).toBe(`${prefix}pitch/`);
    expect(pagePath('partner', locale)).toBe(`${prefix}pitch/partner/`);
  });
});

describe('translated footnotes', () => {
  it('formats the English footnote with one reference mark', () => {
    expect(enFootnote('screenImage')).toBe(
      formatFootnote(enDisclaimers.screenImage),
    );
    expect(enFootnote('normalOperation')).toBe(
      formatFootnote(enDisclaimers.normalOperation),
    );
  });

  it('formats the Traditional Chinese footnote with one reference mark', () => {
    expect(zhFootnote('screenImage')).toBe(
      formatFootnote(zhDisclaimers.screenImage),
    );
    expect(zhFootnote('normalOperation')).toBe(
      formatFootnote(zhDisclaimers.normalOperation),
    );
  });
});
