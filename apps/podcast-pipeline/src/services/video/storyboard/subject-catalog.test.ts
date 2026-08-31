import { describe, expect, it } from 'vitest';

import {
  buildVisualSubjectSearchQueries,
  parseVisualSubjectCatalog,
} from './subject-catalog.js';

function rawSubject(
  overrides: Partial<{
    id: string;
    canonicalName: string;
    type: 'company' | 'standard';
    aliases: string[];
    storyRole: 'primary' | 'secondary';
    evidenceSceneIds: string[];
    searchQueries: string[];
    identityHints: string[];
    negativeHints: string[];
  }> = {},
) {
  return {
    id: 'subject-coinbase',
    canonicalName: 'Coinbase',
    type: 'company' as const,
    aliases: [],
    storyRole: 'primary' as const,
    evidenceSceneIds: ['scene-01'],
    searchQueries: ['Coinbase tokenized stocks'],
    identityHints: ['crypto exchange', 'Base'],
    negativeHints: [],
    officialDomains: [],
    ...overrides,
  };
}

describe('visual subject catalog', () => {
  it('keeps the story primary subject explicit for the lead visual', () => {
    const catalog = parseVisualSubjectCatalog({
      primarySubjectId: 'subject-coinbase',
      subjects: [rawSubject()],
    });

    expect(catalog.primarySubjectId).toBe('subject-coinbase');
    expect(catalog.subjects[0]).toMatchObject({
      canonicalName: 'Coinbase',
      storyRole: 'primary',
    });
  });

  it('promotes Alpaca Markets over the animal name collision', () => {
    const catalog = parseVisualSubjectCatalog({
      primarySubjectId: 'subject-coinbase',
      subjects: [
        rawSubject(),
        rawSubject({
          id: 'subject-alpaca',
          canonicalName: 'Alpaca',
          aliases: ['Alpaca Markets'],
          storyRole: 'secondary',
          evidenceSceneIds: ['scene-10'],
          searchQueries: ['Alpaca custody broker'],
          identityHints: ['brokerage', 'custody'],
          negativeHints: ['animal', 'alpacas'],
        }),
      ],
    });

    const alpaca = catalog.subjects.find(
      (subject) => subject.id === 'subject-alpaca',
    );
    expect(alpaca?.canonicalName).toBe('Alpaca Markets');
    expect(alpaca?.aliases).toContain('Alpaca');
    expect(buildVisualSubjectSearchQueries(alpaca!)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Alpaca'),
        'Alpaca Markets',
      ]),
    );
  });

  it('adds Base context to B20 so camera flashes and Honda engines cannot satisfy the identity phrase', () => {
    const catalog = parseVisualSubjectCatalog({
      primarySubjectId: 'subject-coinbase',
      subjects: [
        rawSubject(),
        rawSubject({
          id: 'subject-b20',
          canonicalName: 'B20',
          type: 'standard',
          storyRole: 'secondary',
          evidenceSceneIds: ['scene-11', 'scene-13'],
          searchQueries: ['B20 tokenized stocks'],
          identityHints: ['Base', 'ERC-20'],
          negativeHints: ['Profoto', 'camera', 'Honda', 'engine'],
        }),
      ],
    });

    const b20 = catalog.subjects.find((subject) => subject.id === 'subject-b20');
    expect(b20?.canonicalName).toBe('Base B20');
    expect(b20?.aliases).toContain('B20');
    expect(buildVisualSubjectSearchQueries(b20!)).toEqual(
      expect.arrayContaining(['Base B20']),
    );
  });

  it('rejects catalogs with more than one primary subject', () => {
    expect(() =>
      parseVisualSubjectCatalog({
        primarySubjectId: 'subject-coinbase',
        subjects: [
          rawSubject(),
          rawSubject({
            id: 'subject-binance',
            canonicalName: 'Binance',
            storyRole: 'primary',
            evidenceSceneIds: ['scene-02'],
            searchQueries: ['Binance tokenized stocks'],
          }),
        ],
      }),
    ).toThrow('exactly one primary subject');
  });
});
