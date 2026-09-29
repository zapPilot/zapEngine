import { describe, expect, it } from 'vitest';

import {
  normalizeVisualSubjectCatalogInput,
  parseVisualSubjectCatalog,
  prefixedSubjectQuery,
  visualSubjectById,
  visualSubjectsForScene,
} from './subject-catalog.js';

function subject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'subject-primary',
    canonicalName: 'Primary Subject',
    type: 'company',
    aliases: [],
    storyRole: 'primary',
    evidenceSceneIds: ['scene-01'],
    searchQueries: ['Primary Subject news'],
    identityHints: ['company'],
    negativeHints: [],
    officialDomains: [],
    ...overrides,
  };
}

describe('subject catalog coverage edges', () => {
  it('rejects duplicate IDs while preserving the declared primary contract', () => {
    expect(() =>
      parseVisualSubjectCatalog({
        primarySubjectId: 'subject-primary',
        subjects: [
          subject(),
          subject({
            storyRole: 'secondary',
            canonicalName: 'Duplicate Subject',
            evidenceSceneIds: ['scene-02'],
          }),
        ],
      }),
    ).toThrow('duplicate subject IDs');
  });

  it('rejects a missing declared primary and a declared ID that is not primary', () => {
    expect(() =>
      parseVisualSubjectCatalog({
        primarySubjectId: 'subject-missing',
        subjects: [subject()],
      }),
    ).toThrow('Primary visual subject is missing from the catalog');

    expect(() =>
      parseVisualSubjectCatalog({
        primarySubjectId: 'subject-primary',
        subjects: [
          subject({ storyRole: 'secondary' }),
          subject({
            id: 'subject-other',
            canonicalName: 'Other Company',
            storyRole: 'primary',
            evidenceSceneIds: ['scene-02'],
          }),
        ],
      }),
    ).toThrow('primarySubjectId must point at the primary story subject');
  });

  it('leaves non-catalog shapes alone and drops malformed scene cues during repair', () => {
    expect(normalizeVisualSubjectCatalogInput(null)).toBeNull();
    expect(
      normalizeVisualSubjectCatalogInput({
        primarySubjectId: 42,
        subjects: [],
      }),
    ).toEqual({ primarySubjectId: 42, subjects: [] });

    const repaired = normalizeVisualSubjectCatalogInput({
      primarySubjectId: 'subject-primary',
      subjects: [
        null,
        subject({
          aliases: 'not-an-array',
          evidenceSceneIds: 'not-an-array',
          searchQueries: 'not-an-array',
          identityHints: 'not-an-array',
          negativeHints: 'not-an-array',
          officialDomains: 'not-an-array',
        }),
      ],
      sceneCues: [
        null,
        { sceneId: 'bad-scene', visualCue: 'valid visual cue' },
        { sceneId: 'scene-01', visualCue: 7 },
        { sceneId: 'scene-02', visualCue: 'x' },
        { sceneId: 'scene-03', visualCue: 'valid visual cue' },
      ],
    }) as { sceneCues: unknown[] };

    expect(repaired.sceneCues).toEqual([
      { sceneId: 'scene-03', subjectId: null, visualCue: 'valid visual cue' },
    ]);
  });

  it('deduplicates repaired scene cues and enforces the 64-cue cap', () => {
    const sceneCues = Array.from({ length: 65 }, (_, index) => ({
      sceneId: `scene-${String(index + 1).padStart(2, '0')}`,
      visualCue: `cue ${index + 1}`,
    }));
    sceneCues.splice(1, 0, {
      sceneId: 'scene-01',
      visualCue: 'duplicate cue',
    });

    const repaired = normalizeVisualSubjectCatalogInput({
      primarySubjectId: 'subject-primary',
      subjects: [subject()],
      sceneCues,
    }) as { sceneCues: unknown[] };

    expect(repaired.sceneCues).toHaveLength(64);
  });

  it('covers empty assignments, missing IDs, and an empty prefixed phrase', () => {
    const catalog = parseVisualSubjectCatalog({
      primarySubjectId: 'subject-primary',
      subjects: [subject()],
    });
    const primary = catalog.subjects[0]!;

    expect(visualSubjectById(catalog, 'subject-missing')).toBeNull();
    expect(visualSubjectsForScene(catalog, undefined)).toEqual([]);
    expect(prefixedSubjectQuery(primary, '   ')).toBe('Primary Subject');
  });

  it('keeps an ambiguous subject unchanged when no usable identity hint exists', () => {
    const catalog = parseVisualSubjectCatalog({
      primarySubjectId: 'subject-primary',
      subjects: [
        subject({
          canonicalName: 'Ambiguous Product',
          negativeHints: ['other product'],
          identityHints: [' x '],
        }),
      ],
    });

    expect(catalog.subjects[0]?.canonicalName).toBe('Ambiguous Product');
  });

  it('keeps a long ambiguous name when adding the hint would exceed the schema bound', () => {
    const canonicalName = `A${'b'.repeat(69)}`;
    const catalog = parseVisualSubjectCatalog({
      primarySubjectId: 'subject-primary',
      subjects: [
        subject({
          canonicalName,
          type: 'object',
          identityHints: ['twenty character hint'],
        }),
      ],
    });

    expect(catalog.subjects[0]?.canonicalName).toBe(canonicalName);
  });

  it('chooses the longest identity-bearing alias and de-duplicates demoted names', () => {
    const catalog = parseVisualSubjectCatalog({
      primarySubjectId: 'subject-primary',
      subjects: [
        subject({
          canonicalName: 'B20',
          type: 'standard',
          aliases: ['B20', 'Base B20', 'Super Base B20'],
          identityHints: ['Base'],
        }),
      ],
    });

    expect(catalog.subjects[0]).toMatchObject({
      canonicalName: 'Super Base B20',
      aliases: ['B20', 'Base B20'],
    });
  });

  it('drops blank aliases while adding a contextual identity hint', () => {
    const catalog = parseVisualSubjectCatalog({
      primarySubjectId: 'subject-primary',
      subjects: [
        subject({
          canonicalName: 'GPU',
          type: 'object',
          aliases: ['  '],
          identityHints: ['NVIDIA'],
        }),
      ],
    });

    expect(catalog.subjects[0]).toMatchObject({
      canonicalName: 'NVIDIA GPU',
      aliases: ['GPU'],
    });
  });
});
