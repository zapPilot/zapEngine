import { describe, expect, it } from 'vitest';

import { PODCAST_INTRO_VISUAL_INTENT } from '../podcast-packaging.js';
import {
  createImageSearchTrace,
  visualSceneSelectionSchema,
} from './image-search-trace.js';
import { parseVisualSubjectCatalog } from './storyboard/subject-catalog.js';
import {
  evaluateVisualQuality,
  VisualQualityGateError,
} from './visual-quality-gate.js';

const catalog = parseVisualSubjectCatalog({
  primarySubjectId: 'subject-openai',
  subjects: [
    {
      id: 'subject-openai',
      canonicalName: 'OpenAI',
      type: 'company',
      aliases: [],
      storyRole: 'primary',
      evidenceSceneIds: ['scene-01'],
      identityHints: ['AI research'],
      negativeHints: [],
      searchQualifier: null,
    },
  ],
});
const draft = (count: number) => ({
  scenes: Array.from({ length: count }, (_, index) => ({
    sceneId: `scene-${String(index + 1).padStart(2, '0')}`,
    startSentenceId: `s${String(index + 1).padStart(4, '0')}`,
    endSentenceId: `s${String(index + 1).padStart(4, '0')}`,
    imageSearchIntent: ['OpenAI'],
  })),
});
const selection = (index: number) =>
  visualSceneSelectionSchema.parse({
    sceneId: `scene-${String(index + 1).padStart(2, '0')}`,
    subjectKey: 'openai',
    matchedSubjectKey: 'dots',
    selection: 'pool-fallback',
    sourceQuery: 'OpenAI',
    providerRank: 0,
    fallbackReason: 'subject-entries-exhausted',
    cueMatched: false,
    fallbackBasis: 'primary-subject',
    rejections: [],
  });
const trace = () => createImageSearchTrace({ primary: 5, targeted: 3, max: 8 });

describe('visual quality gate', () => {
  it('rejects descriptive or non-catalog intents', () => {
    const storyboard = draft(1);
    storyboard.scenes[0]!.imageSearchIntent = ['OpenAI office photo'];
    const report = evaluateVisualQuality({
      draft: storyboard,
      catalog,
      imageSearch: trace(),
    });
    expect(report.violations).toEqual([
      'non-catalog-query',
      'query-shaping-term',
    ]);
    expect(new VisualQualityGateError(report).message).toContain(
      'non-catalog-query',
    );
  });
  it('enforces the 10-scene ratio boundary and missing basis on resumed selections', () => {
    const imageSearch = trace();
    imageSearch.scenes = Array.from({ length: 9 }, (_, index) =>
      selection(index),
    );
    imageSearch.resumedSceneCount = 9;
    expect(
      evaluateVisualQuality({ draft: draft(9), catalog, imageSearch }).passed,
    ).toBe(true);
    expect(
      evaluateVisualQuality({ draft: draft(10), catalog, imageSearch })
        .violations,
    ).toContain('cross-subject-fallback-ratio');
    imageSearch.scenes[0]!.fallbackBasis = null;
    expect(
      evaluateVisualQuality({ draft: draft(9), catalog, imageSearch })
        .violations,
    ).toContain('fallback-missing-basis');
  });
  it('detects packed publisher images and reports healthy distribution', () => {
    const imageSearch = trace();
    imageSearch.scenes = [0, 1, 2].map((index) => ({
      ...selection(index),
      selection: 'article' as const,
      publisherImage: {
        role: 'body' as const,
        bodyIndex: index,
        articlePosition: 0.5,
        lexicalScore: 0,
      },
    }));
    expect(
      evaluateVisualQuality({ draft: draft(30), catalog, imageSearch })
        .violations,
    ).toEqual(['publisher-front-loaded', 'publisher-prefix-packed']);
    imageSearch.scenes[1]!.sceneId = 'scene-15';
    imageSearch.scenes[2]!.sceneId = 'scene-25';
    expect(
      evaluateVisualQuality({ draft: draft(30), catalog, imageSearch }).passed,
    ).toBe(true);
  });
});

it('reports empty content ratios and unknown publisher positions without dividing by zero', () => {
  const imageSearch = trace();
  const branding = {
    scenes: [
      {
        ...draft(1).scenes[0]!,
        imageSearchIntent: [PODCAST_INTRO_VISUAL_INTENT],
      },
    ],
  };
  expect(
    evaluateVisualQuality({ draft: branding, catalog, imageSearch }),
  ).toMatchObject({ contentScenes: 0, maxQuerySceneRatio: 0, reuseRatio: 0 });
  imageSearch.scenes = [0, 1, 2].map((index) => ({
    ...selection(index),
    selection: 'article' as const,
    publisherImage: {
      role: 'body' as const,
      bodyIndex: index,
      articlePosition: null,
      lexicalScore: 0,
    },
  }));
  expect(
    evaluateVisualQuality({ draft: draft(30), catalog, imageSearch })
      .violations,
  ).toContain('publisher-prefix-packed');
});
