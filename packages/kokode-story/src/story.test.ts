import { describe, expect, it } from 'vitest';

import * as story from './index.js';
import { LOCALES } from './locales.js';
import { storyFor } from './localized.js';
import {
  arcViolations,
  BEATS,
  DEMO_FIGURES,
  DEMOS,
  DISCLAIMERS,
  DOCTOR_DECK,
  FILM,
  FILM_ORDER,
  footnote,
  INTEREST,
  LANDING,
  PARTNER_DECK,
  PROMO,
  PROMO_ORDER,
  PROMO_UI,
} from './index.js';
import type { FilmLine } from './film.js';
import type { PromoScene } from './promo.js';
import type { BeatId, DisclaimerId, Group } from './types.js';

// Claim guardrails over every string the story exports. When one fails,
// change the copy; do not widen the guardrail.

interface Entry {
  readonly path: string;
  readonly text: string;
}

function collect(value: unknown, path: string, out: Entry[]): Entry[] {
  if (typeof value === 'string') {
    out.push({ path, text: value });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => collect(item, `${path}[${index}]`, out));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      collect(item, `${path}.${key}`, out);
    }
  }
  return out;
}

const JAPANESE = /[\u3000-ヿ㐀-䶿一-鿿＀-￯]/;

describe.each(LOCALES)('%s claim guardrails', (locale) => {
  const localized = storyFor(locale);
  const ALL =
    locale === 'ja'
      ? Object.entries(story).flatMap(([name, value]) =>
          collect(value, name, []),
        )
      : Object.entries(localized).flatMap(([name, value]) =>
          collect(value, name, []),
        );
  const COPY = ALL.filter((entry) => !entry.path.startsWith('DISCLAIMERS.'));
  const offending = (pattern: RegExp, entries = COPY) =>
    entries
      .filter((entry) => pattern.test(entry.text))
      .map((entry) => `${entry.path}: ${entry.text}`);
  it('collects every exported string', () => {
    expect(ALL.length).toBeGreaterThan(200);
    expect(COPY.some((entry) => entry.path.startsWith('BEATS.'))).toBe(true);
  });

  it('makes no absolute, regulatory or medical-device claim outside the disclaimers', () => {
    expect(
      offending(
        /絶対|完全|万全|必ず|保証|準拠|認証|医療機器|診断|治療|検閲|100\s*[%％]/,
      ),
    ).toEqual([]);
    expect(
      offending(
        /guarantee|compliant|compliance|hipaa|diagnos|censor|certified|\bcures?\b|完全安全|不會外洩|保證|符合.*法規|認證|醫療器材|診斷|治療|審查|絕對安全/i,
      ),
    ).toEqual([]);
  });

  it('names no cloud vendor', () => {
    expect(
      offending(
        /\b(?:aws|amazon|azure|microsoft|google|gemini|openai|anthropic|claude|copilot|bedrock|vertex)\b/i,
        ALL,
      ),
    ).toEqual([]);
  });

  it('carries no revenue-share wording or percentages (the repo is public)', () => {
    expect(
      offending(
        /レベニューシェア|収益分配|利益配分|分配率|紹介料|手数料|マージン|コミッション|インセンティブ|報酬|分潤|revenue[\s-]?share|rev[\s-]?share|commission|margin|kickback|referral fee|payout|\d\s*[%％]/i,
        ALL,
      ),
    ).toEqual([]);
  });

  it('never makes the technology the hero', () => {
    expect(
      offending(
        /mac\s*studio|mac\s*mini|ollama|hermes|llama|flux|stable diffusion|nvidia/i,
        ALL,
      ),
    ).toEqual([]);
  });

  it('retires the old plan names', () => {
    expect(offending(/KOKODE\s*(?:Studio|Rack|Infra)/i, ALL)).toEqual([]);
  });

  it('mentions ChatGPT only in desiredWorld and experience', () => {
    const allowedBeats: readonly BeatId[] = ['desiredWorld', 'experience'];
    const allowedScenes = [
      ...FILM_ORDER.filter((scene) =>
        scene.beats.some((beat) => allowedBeats.includes(beat)),
      ).map((scene) => `FILM.${scene.id}.`),
      ...PROMO_ORDER.filter((scene) =>
        scene.beats.some((beat) => allowedBeats.includes(beat)),
      ).map((scene) => `PROMO.${scene.id}.`),
    ];
    const allowed = [
      ...allowedBeats.map((beat) => `BEATS.${beat}.`),
      ...allowedScenes,
    ];
    const misplaced = ALL.filter(
      (entry) =>
        /chatgpt/i.test(entry.text) &&
        !allowed.some((prefix) => entry.path.startsWith(prefix)),
    );
    expect(misplaced).toEqual([]);
    expect(offending(/ChatGPT/, ALL).length).toBeGreaterThan(0);
  });

  it('quotes exactly one price: the PoC reference', () => {
    const amounts = ALL.flatMap(
      (entry) =>
        entry.text.match(
          /jpy\s*\d[\d,.]*|\d[\d,.]*\s*(?:萬|万|億|千)?\s*(?:日圓|円)|[¥￥$]\s*\d|\d[\d,.]*\s*(?:usd|jpy|yen|dollars?)/gi,
        ) ?? [],
    );
    expect(amounts).toEqual([
      { ja: '30万円', en: 'JPY 300,000', 'zh-Hant': '30 萬日圓' }[locale],
    ]);
    expect(BEATS.startSmall.price?.label).toBe('PoC');
  });
});

describe('disclaimers', () => {
  it('keeps the three sentences of the previous site verbatim', () => {
    expect(DISCLAIMERS.normalOperation).toBe(
      '通常運用では患者データを外部LLMへ送信しない構成',
    );
    expect(DISCLAIMERS.clinicalJudgment).toBe(
      '診断そのものではなく、情報の検索・要約・文書作成・研究支援から導入できます。最終確認と判断は医療従事者が行います。',
    );
    expect(DISCLAIMERS.notReplacement).toBe(
      'KOKODEは医療従事者による判断を代替するものではありません。',
    );
  });

  it('prints one reference mark per footnote', () => {
    expect(footnote('screenImage')).toBe('※画面はイメージです');
    expect(footnote('normalOperation')).toBe(`※${DISCLAIMERS.normalOperation}`);
  });

  it('marks every demo as an image and patient data as fictional', () => {
    for (const demo of Object.values(DEMOS)) {
      expect(demo.disclaimers).toContain('screenImage');
    }
    expect(DEMOS.patient.disclaimers).toEqual(
      expect.arrayContaining(['fictionalPatient', 'draftOnly']),
    );
    expect(DEMOS.image.disclaimers).toContain('draftOnly');
  });

  it('maps every demo figure to a demo', () => {
    for (const [figure, demo] of Object.entries(DEMO_FIGURES)) {
      expect(DEMOS[demo], figure).toBeDefined();
    }
    expect(Object.keys(DEMO_FIGURES).sort()).toEqual(
      ['demoImage', 'demoPatient', 'experience'].sort(),
    );
  });
});

describe('narrative', () => {
  const sequences: Record<string, readonly Group[]> = {
    LANDING,
    DOCTOR_DECK,
    PARTNER_DECK,
    FILM_ORDER,
    PROMO_ORDER,
  };

  it.each(Object.entries(sequences))(
    '%s follows the story arc',
    (_, groups) => {
      expect(arcViolations(groups)).toEqual([]);
    },
  );

  it('has the slide counts the handoff asks for', () => {
    expect(DOCTOR_DECK).toHaveLength(14);
    expect(PARTNER_DECK).toHaveLength(15);
    expect(PARTNER_DECK.slice(0, 11)).toEqual(DOCTOR_DECK.slice(0, 11));
  });

  it('uses every beat on some surface', () => {
    const used = new Set(
      Object.values(sequences).flatMap((groups) =>
        groups.flatMap((group) => group.beats),
      ),
    );
    expect(Object.keys(BEATS).filter((id) => !used.has(id as BeatId))).toEqual(
      [],
    );
  });

  it('reports each arc rule', () => {
    const hero: Group = { id: 'hero', beats: ['hero'] };
    const close: Group = { id: 'close', beats: ['cta'] };
    const body: Group = {
      id: 'body',
      beats: [
        'painPatient',
        'painContent',
        'solution',
        'boundary',
        'demoPatient',
        'demoImage',
      ],
    };
    expect(arcViolations([hero, body, close])).toEqual([]);
    expect(arcViolations([])).toEqual([
      'opens without hero or a pain',
      'closes without cta or partnerCta',
      'states the answer before a pain',
      'misses painPatient',
      'misses painContent',
      'misses solution',
      'misses boundary',
      'misses demoPatient',
      'misses demoImage',
      'misses cta or partnerCta',
    ]);
    expect(
      arcViolations([
        { id: 'answer', beats: ['solution'] },
        { ...body, beats: body.beats.filter((b) => b !== 'solution') },
        close,
      ]),
    ).toEqual([
      'opens without hero or a pain',
      'states the answer before a pain',
    ]);
    expect(
      arcViolations([hero, body, { id: 'body', beats: [] }, close, close]),
    ).toEqual([
      'repeats cta',
      'body is empty',
      'repeats group body',
      'repeats group close',
    ]);
  });
});

/** Every narrated line: unique ids, Japanese caption, English voice, Chinese draft. */
function expectNarration(lines: readonly FilmLine[]): void {
  expect(new Set(lines.map((line) => line.id)).size).toBe(lines.length);
  for (const line of lines) {
    expect(JAPANESE.test(line.ja), line.id).toBe(true);
    expect(JAPANESE.test(line.en), line.id).toBe(false);
    expect(line['zh-Hant'], line.id).toBeTruthy();
    expect(/[\u3040-\u30ff]/u.test(line['zh-Hant']), line.id).toBe(false);
  }
}

/** Screens carry `imageNote`; a demo carries its disclaimers (draftOnly aside). */
function expectNotes(
  scenes: Readonly<Record<string, PromoScene>>,
  imageNote: (scene: PromoScene) => DisclaimerId,
): void {
  for (const [id, scene] of Object.entries(scenes)) {
    if (scene.screen !== 'title') {
      expect(scene.notes, id).toContain(imageNote(scene));
    }
    for (const note of scene.demo === undefined
      ? []
      : DEMOS[scene.demo].disclaimers) {
      if (note !== 'draftOnly') {
        expect(scene.notes, id).toContain(note);
      }
    }
  }
}

describe('film', () => {
  it('has a scene for every FILM_ORDER entry and nothing else', () => {
    expect(Object.keys(FILM)).toEqual(FILM_ORDER.map((scene) => scene.id));
  });

  it('provides three caption languages and English narration on every line', () => {
    expectNarration(Object.values(FILM).flatMap((scene) => scene.lines));
  });

  it('notes the screen image and fictional data wherever the film shows them', () => {
    expectNotes(FILM, () => 'screenImage');
  });
});

describe('promo', () => {
  const lines = Object.values(PROMO).flatMap((scene) => scene.lines);
  const filmLines = Object.values(FILM).flatMap((scene) => scene.lines);

  it('has a scene for every PROMO_ORDER entry and nothing else', () => {
    expect(Object.keys(PROMO)).toEqual(PROMO_ORDER.map((scene) => scene.id));
    for (const [id, scene] of Object.entries(PROMO)) {
      expect(scene.lines.length, id).toBeGreaterThan(0);
    }
  });

  it('narrates in English with three caption languages, reusing the film words', () => {
    expectNarration(lines);
    for (const line of lines) {
      const film = filmLines.find((candidate) => candidate.id === line.id);
      if (film !== undefined) {
        expect(line, line.id).toBe(film);
      }
    }
    expect(lines.filter((line) => !filmLines.includes(line))).toHaveLength(1);
  });

  it('notes the screen image, the equipment image and fictional data wherever it shows them', () => {
    expectNotes(PROMO, (scene) =>
      scene.screen === 'hardware' ? 'hardwareImage' : 'screenImage',
    );
    expect(PROMO.turnkey.notes).toContain('hardwareImage');
  });

  it('tiles the four pilot workflows in every language', () => {
    const workflows = INTEREST.map((option) => option.id).filter(
      (id) => id !== 'other' && id !== 'partner',
    );
    for (const locale of LOCALES) {
      const ui = storyFor(locale).PROMO_UI;
      expect(
        ui.tiles.map((tile) => tile.id),
        locale,
      ).toEqual(workflows);
      expect(ui.pills, locale).toHaveLength(PROMO_UI.pills.length);
    }
  });
});

describe('form', () => {
  it('offers short, unique options the lead column can store', () => {
    expect(new Set(INTEREST.map((option) => option.id)).size).toBe(
      INTEREST.length,
    );
    expect(new Set(INTEREST.map((option) => option.label)).size).toBe(
      INTEREST.length,
    );
    for (const option of INTEREST) {
      expect(option.label.length).toBeLessThanOrEqual(120);
    }
    expect(INTEREST.map((option) => option.id)).toContain('partner');
  });

  it('links beat actions only to existing options', () => {
    const ids = INTEREST.map((option) => option.id as string);
    for (const beat of Object.values(BEATS)) {
      const interest = beat.action?.interest;
      if (interest !== undefined) {
        expect(ids).toContain(interest);
      }
    }
  });
});

describe('locale contracts', () => {
  function keys(value: unknown, prefix = ''): string[] {
    if (Array.isArray(value)) {
      return value.flatMap((item, i) => keys(item, `${prefix}[${i}]`));
    }
    if (value !== null && typeof value === 'object') {
      return Object.entries(value).flatMap(([key, item]) =>
        keys(item, `${prefix}.${key}`),
      );
    }
    return [prefix];
  }
  it.each(LOCALES)(
    '%s preserves the story structure and identifiers',
    (locale) => {
      const localized = storyFor(locale);
      const japanese = storyFor('ja');
      expect(keys(localized)).toEqual(keys(japanese));
      expect(localized.INTEREST.map((option) => option.id)).toEqual(
        japanese.INTEREST.map((option) => option.id),
      );
      for (const id of Object.keys(BEATS) as BeatId[]) {
        expect(localized.BEATS[id].notes).toEqual(BEATS[id].notes);
        expect(localized.BEATS[id].figure).toEqual(BEATS[id].figure);
        expect(localized.BEATS[id].action?.interest).toEqual(
          BEATS[id].action?.interest,
        );
      }
      const translatedCopy = collect(localized, '', []);
      if (locale === 'en') {
        expect(
          translatedCopy.filter((entry) => /[ぁ-ヿ一-鿿]/.test(entry.text)),
        ).toEqual([]);
      }
      if (locale === 'zh-Hant') {
        expect(
          translatedCopy.filter((entry) => /[ぁ-ヿ]/.test(entry.text)),
        ).toEqual([]);
      }
      expect(localized.DEMO_FIGURES).toEqual(japanese.DEMO_FIGURES);
      for (const id of ['chat', 'patient', 'image'] as const) {
        expect(localized.DEMOS[id].disclaimers).toEqual(
          japanese.DEMOS[id].disclaimers,
        );
      }
      expect(localized.BEATS.painPatient.source?.href).toBe(
        japanese.BEATS.painPatient.source?.href,
      );
    },
  );
});

// This package must also work in Node, without a browser document.
describe('form language selection', () => {
  it.each([...LOCALES, 'unknown'])(
    'selects form copy for %s without DOM access',
    async (lang) => {
      const { formForPage } = await import('./form-locales.js');
      expect(formForPage(lang)).toEqual(
        storyFor(lang === 'unknown' ? 'ja' : (lang as (typeof LOCALES)[number]))
          .FORM,
      );
    },
  );
});
