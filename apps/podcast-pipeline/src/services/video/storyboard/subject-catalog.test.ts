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
    storyRole: string;
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
    storyRole: 'primary',
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

  it('allows a title-grounded primary subject without fabricated scene evidence', () => {
    const catalog = parseVisualSubjectCatalog({
      primarySubjectId: 'subject-coinbase',
      subjects: [rawSubject({ evidenceSceneIds: [] })],
    });

    expect(catalog.subjects[0]?.evidenceSceneIds).toEqual([]);
  });

  it('still requires scene evidence for every non-primary subject', () => {
    expect(() =>
      parseVisualSubjectCatalog({
        primarySubjectId: 'subject-coinbase',
        subjects: [
          rawSubject(),
          rawSubject({
            id: 'subject-binance',
            canonicalName: 'Binance',
            storyRole: 'secondary',
            evidenceSceneIds: [],
            searchQueries: ['Binance'],
          }),
        ],
      }),
    ).toThrow(
      'Only the title-grounded primary subject may omit scene evidence',
    );
  });

  it('repairs bounded LLM shape drift before strict validation', () => {
    const evidenceSceneIds = Array.from(
      { length: 70 },
      (_, index) => `scene-${String(index + 1).padStart(2, '0')}`,
    );
    const catalog = parseVisualSubjectCatalog({
      primarySubjectId: 'subject-coinbase',
      subjects: [
        rawSubject({
          storyRole: 'lead',
          evidenceSceneIds,
          searchQueries: [
            'Coinbase tokenized stocks',
            'Coinbase Base exchange',
            'Coinbase crypto news',
            'Coinbase Wall Street',
          ],
        }),
        rawSubject({
          id: 'subject-base',
          canonicalName: 'Base',
          storyRole: 'mentioned',
          evidenceSceneIds: ['scene-02'],
          searchQueries: ['Base Coinbase L2'],
        }),
      ],
    });

    expect(catalog.subjects[0]).toMatchObject({
      storyRole: 'primary',
      searchQueries: [
        'Coinbase tokenized stocks',
        'Coinbase Base exchange',
        'Coinbase crypto news',
      ],
    });
    expect(catalog.subjects[0]?.evidenceSceneIds).toHaveLength(64);
    expect(catalog.subjects[1]?.storyRole).toBe('supporting');
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

  it('searches a16z by its own name instead of doubling the category hint onto it', () => {
    // The disambiguated canonical name is `venture capital a16z`, which the bare
    // `a16z` query does not contain -- prefixing it sent `venture capital a16z
    // a16z` to image search and matched nothing on any provider.
    const catalog = parseVisualSubjectCatalog({
      primarySubjectId: 'subject-coinbase',
      subjects: [
        rawSubject(),
        rawSubject({
          id: 'subject-a16z',
          canonicalName: 'a16z',
          aliases: ['Andreessen Horowitz'],
          storyRole: 'secondary',
          evidenceSceneIds: ['scene-04'],
          searchQueries: ['a16z'],
          identityHints: ['venture capital'],
        }),
      ],
    });

    const a16z = catalog.subjects.find(
      (subject) => subject.id === 'subject-a16z',
    );
    expect(a16z?.canonicalName).toBe('venture capital a16z');
    expect(a16z?.aliases).toEqual(['a16z', 'Andreessen Horowitz']);
    expect(buildVisualSubjectSearchQueries(a16z!)).toEqual([
      'a16z',
      'venture capital a16z',
    ]);
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

    const b20 = catalog.subjects.find(
      (subject) => subject.id === 'subject-b20',
    );
    expect(b20?.canonicalName).toBe('Base B20');
    expect(b20?.aliases).toContain('B20');
    expect(buildVisualSubjectSearchQueries(b20!)).toEqual(
      expect.arrayContaining(['Base B20']),
    );
  });

  it('disambiguates a subject whose aliases already sit at the bound', () => {
    // Capping over-long drift lands exactly on the alias bound, so demoting the
    // original name here used to overflow it and fail the second strict parse --
    // turning the shape repair into the very lost attempt it exists to avoid.
    const catalog = parseVisualSubjectCatalog({
      primarySubjectId: 'subject-coinbase',
      subjects: [
        rawSubject(),
        rawSubject({
          id: 'subject-b20',
          canonicalName: 'B20',
          type: 'standard',
          storyRole: 'secondary',
          aliases: [
            'Alpha',
            'Bravo',
            'Charlie',
            'Delta',
            'Echo',
            'Foxtrot',
            'Golf',
            'Hotel',
          ],
          evidenceSceneIds: ['scene-11'],
          searchQueries: ['B20 tokenized stocks'],
          identityHints: ['Base', 'ERC-20'],
        }),
      ],
    });

    const b20 = catalog.subjects.find(
      (subject) => subject.id === 'subject-b20',
    );
    expect(b20?.canonicalName).toBe('Base B20');
    expect(b20?.aliases).toHaveLength(6);
    expect(b20?.aliases[0]).toBe('B20');
  });

  it('rejects catalogs with more than one explicit primary subject', () => {
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
