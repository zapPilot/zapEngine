import { describe, expect, it, vi } from 'vitest';

import {
  enrichStoryboardSearchIntents,
  SubjectCatalogUnavailableError,
} from './search-intents.js';
import {
  identitySearchQuery,
  isIdentityQualifier,
  parseVisualSubjectCatalog,
  visualSubjectCatalogSchema,
} from './subject-catalog.js';

const draft = {
  scenes: [
    { sceneId: 'scene-01', startSentenceId: 's0001', endSentenceId: 's0001' },
    { sceneId: 'scene-02', startSentenceId: 's0002', endSentenceId: 's0002' },
  ],
};
const subject = (overrides: Record<string, unknown> = {}) => ({
  id: 'subject-openai',
  canonicalName: 'OpenAI',
  type: 'company',
  aliases: [],
  storyRole: 'primary',
  evidenceSceneIds: ['scene-01'],
  identityHints: ['AI research'],
  negativeHints: [],
  searchQualifier: null,
  ...overrides,
});

describe('identity-first catalog regression', () => {
  it.each(['USDT', 'Hong Kong', 'OpenAI', 'Sui blockchain', 'GPT-6.1 Sol'])(
    'accepts identity qualifier %s',
    (value) => expect(isIdentityQualifier(value)).toBe(true),
  );
  it.each([
    '2024',
    '6.1',
    '2024-2026',
    '123/456',
    'photo',
    'engineers working',
    'Hong Kong headquarters',
    '',
    'one two three four',
    'A'.repeat(33),
    '香港',
  ])('rejects qualifier %s', (value) =>
    expect(isIdentityQualifier(value)).toBe(false),
  );
  it('derives one query and rejects stored catalog as provider input', () => {
    const catalog = parseVisualSubjectCatalog({
      primarySubjectId: 'subject-openai',
      subjects: [subject()],
    });
    expect(catalog.subjects[0]!.searchQuery).toBe('OpenAI');
    expect(() => parseVisualSubjectCatalog(catalog)).toThrow();
    expect(() =>
      parseVisualSubjectCatalog({
        primarySubjectId: 'subject-openai',
        subjects: [subject({ searchQuery: 'OpenAI photo' })],
      }),
    ).toThrow();
    expect(
      visualSubjectCatalogSchema.safeParse({
        ...catalog,
        subjects: [{ ...catalog.subjects[0], searchQuery: 'OpenAI office' }],
      }).success,
    ).toBe(false);
  });
  it('handles null, absent, invalid and repeated qualifiers', () => {
    const base = {
      canonicalName: 'Tether',
      aliases: [],
      type: 'company' as const,
      negativeHints: [],
      identityHints: ['stablecoin issuer'],
    };
    expect(identitySearchQuery(base, 'USDT')).toBe('Tether USDT');
    expect(identitySearchQuery(base, null)).toBe('Tether');
    expect(identitySearchQuery(base)).toBe('Tether stablecoin issuer');
    expect(identitySearchQuery(base, 'Tether')).toBe(
      'Tether stablecoin issuer',
    );
    expect(
      identitySearchQuery({ ...base, identityHints: ['office photo'] }, '2024'),
    ).toBe('Tether');
    expect(
      identitySearchQuery(
        { ...base, canonicalName: 'Dots', identityHints: ['OpenAI'] },
        null,
      ),
    ).toBe('Dots OpenAI');
  });
  it('feeds structural feedback into the next attempt and emits only identity queries', async () => {
    const catalog = vi
      .fn()
      .mockResolvedValueOnce({
        primarySubjectId: 'subject-openai',
        subjects: Array.from({ length: 25 }, (_, index) =>
          subject({
            id: index === 0 ? 'subject-gpt-6.1-sol' : `subject-openai-${index}`,
          }),
        ),
      })
      .mockResolvedValueOnce({
        primarySubjectId: 'subject-openai',
        subjects: [
          subject(),
          subject({
            id: 'subject-dots',
            canonicalName: 'Dots',
            storyRole: 'secondary',
            identityHints: ['OpenAI'],
            searchQualifier: 'OpenAI',
            evidenceSceneIds: ['scene-02'],
          }),
        ],
      });
    const retry = vi.fn();
    const result = await enrichStoryboardSearchIntents(
      {
        draft,
        title: 'OpenAI Dots',
        script: 'OpenAI announced updates. Dots is an OpenAI agent.',
      },
      { provider: { model: 'free', catalog }, onCatalogRetry: retry },
    );
    expect(catalog).toHaveBeenCalledTimes(2);
    expect(catalog.mock.calls[1]![0].repairIssues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('at most 24 subjects in total (received 25)'),
        expect.stringContaining('subject-gpt-6-1-sol'),
      ]),
    );
    expect(result.subjectCatalog).toBeDefined();
    expect(result.sceneAssignments.length).toBeGreaterThan(1);
    expect(
      result.draft.scenes.flatMap((scene) => scene.imageSearchIntent),
    ).toEqual(['OpenAI', 'Dots OpenAI']);
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it('fails closed after three rejected catalogs', async () => {
    const catalog = vi
      .fn()
      .mockResolvedValue({ primarySubjectId: 'subject-openai', subjects: [] });
    const result = enrichStoryboardSearchIntents(
      {
        draft,
        title: 'OpenAI',
        script: 'OpenAI announced updates. OpenAI released products.',
      },
      { provider: { model: 'free', catalog } },
    );
    await expect(result).rejects.toBeInstanceOf(SubjectCatalogUnavailableError);
    expect(catalog).toHaveBeenCalledTimes(3);
  });
});

it('bounds readable catalog repair issues and labels short names by subject ID', async () => {
  const { catalogRepairIssues, contentSceneEvidence } =
    await import('./search-intents.js');
  const { z } = await import('zod');
  const raw = {
    primarySubjectId: 'subject-openai',
    subjects: [subject({ canonicalName: 'A' })],
  };
  try {
    parseVisualSubjectCatalog(raw);
    throw new Error('expected schema rejection');
  } catch (error) {
    expect(catalogRepairIssues(error, raw)).toEqual([
      expect.stringContaining(
        'canonicalName must be 2–80 characters (subject-openai: A)',
      ),
    ]);
  }
  const many = new z.ZodError(
    Array.from({ length: 15 }, () => ({
      code: 'custom' as const,
      path: ['subjects'],
      message: 'x'.repeat(500),
    })),
  );
  const issues = catalogRepairIssues(many, raw);
  expect(issues).toHaveLength(12);
  expect(issues.every((issue) => issue.length === 240)).toBe(true);
  expect(() =>
    contentSceneEvidence({
      draft: {
        scenes: [
          {
            sceneId: 'scene-01',
            startSentenceId: 's9999',
            endSentenceId: 's9999',
          },
        ],
      },
      script: 'OpenAI更新。',
    }),
  ).toThrow('cannot map');
});

it.each([null, 7, {}, { primarySubjectId: 'subject-openai', subjects: null }])(
  'rejects an invalid catalog envelope %j',
  (input) => {
    expect(() => parseVisualSubjectCatalog(input)).toThrow();
  },
);

it('rejects a stored query that names no catalog identity', () => {
  const catalog = parseVisualSubjectCatalog({
    primarySubjectId: 'subject-openai',
    subjects: [subject()],
  });
  expect(
    visualSubjectCatalogSchema.safeParse({
      ...catalog,
      subjects: [{ ...catalog.subjects[0], searchQuery: 'Unknown Company' }],
    }).success,
  ).toBe(false);
});
