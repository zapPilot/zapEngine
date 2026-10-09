import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  fitsRednoteTitle,
  languageNeedsRednoteTitle,
  REDNOTE_TITLE_MAX_UNITS,
  rednoteTitleUnits,
} from './policy.js';

interface CounterRow {
  title: string;
  counter: string;
  submit?: { sent: boolean };
}

const fixture = JSON.parse(
  readFileSync(
    new URL(
      './__fixtures__/rednote-title-counter-2026-10-09.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as { rows: CounterRow[] };

function parseCounter(counter: string): { counted: number; limit: number } {
  const match = /^(\d+) \/ (\d+)$/u.exec(counter);
  if (!match) throw new Error(`Unparseable counter ${counter}`);
  return { counted: Number(match[1]), limit: Number(match[2]) };
}

describe('rednoteTitleUnits against the live form counter', () => {
  it('has the measured rows', () => {
    expect(fixture.rows.length).toBeGreaterThan(10);
  });

  it.each(fixture.rows.map((row) => [row.title, row.counter] as const))(
    'measures %s as the live counter %s',
    (title, counter) => {
      const { counted, limit } = parseCounter(counter);
      expect(limit).toBe(REDNOTE_TITLE_MAX_UNITS);
      expect(rednoteTitleUnits(title)).toBe(counted);
      expect(fitsRednoteTitle(title)).toBe(counted <= limit);
    },
  );

  it('agrees with the live submit outcome for every submitted row', () => {
    for (const row of fixture.rows) {
      if (row.submit) expect(fitsRednoteTitle(row.title)).toBe(row.submit.sent);
    }
  });
});

describe('policy: Rednote title budget (formula-only cases)', () => {
  it('counts the empty title as zero units', () => {
    expect(rednoteTitleUnits('')).toBe(0);
  });

  it('rounds half units up', () => {
    expect(rednoteTitleUnits('a')).toBe(1);
    expect(rednoteTitleUnits('ab')).toBe(1);
  });

  it('routes the Rednote title to the main Chinese lane only', () => {
    expect(languageNeedsRednoteTitle('zh-Hant')).toBe(true);
    expect(languageNeedsRednoteTitle('ja')).toBe(false);
    expect(languageNeedsRednoteTitle('en')).toBe(false);
  });
});
