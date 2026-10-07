import { describe, expect, it } from 'vitest';

import {
  isGenericVisualSubjectName,
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
          }),
        ],
      }),
    ).toThrow(
      'Only the title-grounded primary subject may omit scene evidence',
    );
  });

  it('repairs bounded LLM shape drift before strict validation', () => {
    const evidenceSceneIds = Array.from(
      { length: 160 },
      (_, index) => `scene-${String(index + 1).padStart(2, '0')}`,
    );
    const catalog = parseVisualSubjectCatalog({
      primarySubjectId: 'subject-coinbase',
      subjects: [
        rawSubject({
          storyRole: 'lead',
          evidenceSceneIds,
        }),
        rawSubject({
          id: 'subject-base',
          canonicalName: 'Base',
          storyRole: 'mentioned',
          evidenceSceneIds: ['scene-02'],
        }),
      ],
    });

    expect(catalog.subjects[0]).toMatchObject({
      storyRole: 'primary',
    });
    expect(catalog.subjects[0]?.evidenceSceneIds).toHaveLength(150);
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
    expect([alpaca!.searchQuery]).toEqual(['Alpaca brokerage']);
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

          identityHints: ['venture capital'],
        }),
      ],
    });

    const a16z = catalog.subjects.find(
      (subject) => subject.id === 'subject-a16z',
    );
    expect(a16z?.canonicalName).toBe('venture capital a16z');
    expect(a16z?.aliases).toEqual(['a16z', 'Andreessen Horowitz']);
    expect([a16z!.searchQuery]).toEqual(['a16z venture capital']);
  });

  it('does not prefix a hint-led query that already names the subject', () => {
    // Every subject's query now leads with its identity hint, so the query
    // arriving here already contains the canonical name. Prefixing it again
    // would send "Tether Tether stablecoin issuer" to image search.
    const catalog = parseVisualSubjectCatalog({
      primarySubjectId: 'subject-tether',
      subjects: [
        rawSubject({
          id: 'subject-tether',
          canonicalName: 'Tether',

          identityHints: ['stablecoin issuer'],
        }),
      ],
    });

    const tether = catalog.subjects[0];
    expect(tether?.canonicalName).toBe('Tether');
    expect([tether!.searchQuery]).toEqual(['Tether stablecoin issuer']);
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
    expect([b20!.searchQuery]).toEqual(['B20 Base']);
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
          }),
        ],
      }),
    ).toThrow('exactly one primary subject');
  });
});

describe('generic visual subject names', () => {
  it('blocks abstract categories but not concrete or recognizable visual anchors', () => {
    for (const name of [
      'AI',
      'ai',
      'Ａｉ',
      'technology',
      'markets',
      '科技巨头',
    ]) {
      expect(isGenericVisualSubjectName(name)).toBe(true);
    }
    for (const name of [
      'data  center',
      'GPU',
      'servers',
      'Wall Street',
      '華爾街',
      'Silicon Valley',
      'NVIDIA',
      'Andy Jassy',
      'OpenAI',
      'Claude',
      'Bitcoin',
      'Pentagon',
    ]) {
      expect(isGenericVisualSubjectName(name)).toBe(false);
    }
  });
});
