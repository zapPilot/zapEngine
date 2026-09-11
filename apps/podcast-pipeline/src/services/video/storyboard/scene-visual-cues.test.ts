import { describe, expect, it, vi } from 'vitest';

import type { ImageCandidate } from '../../../types.js';
import { fallbackEntryMatchesSceneQuery } from '../episode-image-pool.js';
import {
  CUE_TOKEN_BONUS,
  MAX_CUE_BONUS,
  searchCueScore,
} from '../search-candidate-ranking.js';
import type { StoryboardDraft } from './draft.js';
import {
  enrichStoryboardSearchIntents,
  groundSceneCues,
  type SearchIntentProvider,
} from './search-intents.js';
import { parseVisualSubjectCatalog } from './subject-catalog.js';

const SCRIPT =
  'NVIDIA 發表新晶片。市場隨後劇烈波動。投資人仍在觀望。法院外聚集媒體。人工智慧仍是焦點。公司公布最新財報。';

function draft(): StoryboardDraft {
  return {
    scenes: Array.from({ length: 6 }, (_value, index) => ({
      sceneId: `scene-${String(index + 1).padStart(2, '0')}`,
      startSentenceId: `s${String(index + 1).padStart(4, '0')}`,
      endSentenceId: `s${String(index + 1).padStart(4, '0')}`,
      imageSearchIntent: ['news photo'],
    })),
  };
}

function nvidiaSubject() {
  return {
    id: 'subject-nvidia',
    canonicalName: 'NVIDIA',
    type: 'company' as const,
    aliases: [] as string[],
    storyRole: 'primary' as const,
    evidenceSceneIds: ['scene-01'],
    searchQueries: ['NVIDIA GPU maker'],
    identityHints: ['GPU maker'],
    negativeHints: [] as string[],
    officialDomains: [] as string[],
  };
}

function provider(sceneCues: unknown[]): SearchIntentProvider {
  return {
    model: 'openrouter/test',
    catalog: vi.fn(() =>
      Promise.resolve({
        primarySubjectId: 'subject-nvidia',
        subjects: [nvidiaSubject()],
        sceneCues,
      }),
    ),
  };
}

function candidate(altText: string): ImageCandidate {
  return {
    imageUrl: 'https://images.example.com/photo.jpg',
    sourceUrl: 'https://news.example.com/story',
    origin: 'brave',
    altText,
  };
}

describe('scene visual cues', () => {
  it('grounds cues, preserves unknown-subject cues, and assigns model context only after direct evidence', async () => {
    const result = await enrichStoryboardSearchIntents(
      { draft: draft(), title: 'NVIDIA 新晶片', script: SCRIPT },
      {
        provider: provider([
          {
            sceneId: 'scene-01',
            subjectId: 'subject-nvidia',
            visualCue: 'chip launch keynote',
          },
          {
            sceneId: 'scene-02',
            subjectId: 'subject-nvidia',
            visualCue: 'stock chart plunge',
          },
          {
            sceneId: 'scene-03',
            subjectId: null,
            visualCue: 'trading desk screens',
          },
          {
            sceneId: 'scene-04',
            subjectId: 'subject-missing',
            visualCue: 'courtroom exterior press',
          },
          {
            sceneId: 'scene-05',
            subjectId: null,
            visualCue: 'artificial intelligence',
          },
          {
            sceneId: 'scene-06',
            subjectId: null,
            visualCue: '2024 earnings call',
          },
          {
            sceneId: 'scene-99',
            subjectId: null,
            visualCue: 'server rack aisle',
          },
        ]),
      },
    );

    expect(result.degradedReason).toBeUndefined();
    expect(result.sceneAssignments.length).toBeGreaterThan(1);
    expect(result.sceneAssignments.map((row) => row.selectionReason)).toContain(
      'model-context',
    );
    expect(result.sceneAssignments[0]?.selectionReason).toBe('direct');
    expect(result.sceneAssignments[1]).toMatchObject({
      sceneId: 'scene-02',
      subjectIds: ['subject-nvidia'],
      selectionReason: 'model-context',
    });
    expect(result.sceneAssignments[2]?.selectionReason).toBe('section-context');
    expect(result.draft.scenes[1]?.visualCue).toBe('stock chart plunge');
    expect(result.draft.scenes[3]?.visualCue).toBe('courtroom exterior press');
    expect(
      result.subjectCatalog?.sceneCues?.find(
        (cue) => cue.sceneId === 'scene-04',
      )?.subjectId,
    ).toBeNull();
    expect(
      result.subjectCatalog?.sceneCues?.map((cue) => cue.sceneId),
    ).not.toContain('scene-05');
    expect(
      result.subjectCatalog?.sceneCues?.map((cue) => cue.sceneId),
    ).not.toContain('scene-06');
    expect(
      result.subjectCatalog?.sceneCues?.map((cue) => cue.sceneId),
    ).not.toContain('scene-99');
  });

  it.each([
    ['non-English', '晶片 發表'],
    ['six words', 'chip launch keynote stage audience lights'],
  ])(
    'drops %s cues without degrading the catalog',
    async (_label, visualCue) => {
      const result = await enrichStoryboardSearchIntents(
        { draft: draft(), title: 'NVIDIA 新晶片', script: SCRIPT },
        {
          provider: provider([
            { sceneId: 'scene-02', subjectId: 'subject-nvidia', visualCue },
          ]),
        },
      );
      expect(result.degradedReason).toBeUndefined();
      expect(result.sceneAssignments.length).toBeGreaterThan(1);
      expect(result.subjectCatalog?.sceneCues).toEqual([]);
    },
  );

  it('takes only the first cue row for a scene even when that row is rejected', () => {
    const catalog = parseVisualSubjectCatalog({
      primarySubjectId: 'subject-nvidia',
      subjects: [nvidiaSubject()],
      sceneCues: [
        {
          sceneId: 'scene-02',
          subjectId: 'subject-nvidia',
          visualCue: '2024 earnings call',
        },
        {
          sceneId: 'scene-02',
          subjectId: 'subject-nvidia',
          visualCue: 'stock chart plunge',
        },
      ],
    });
    const grounded = groundSceneCues(catalog, {
      title: 'NVIDIA 新晶片',
      scenes: [{ sceneId: 'scene-02', text: '市場隨後劇烈波動。' }],
    });
    expect(grounded.sceneCues).toEqual([]);
  });

  it('repairs the compact provider scenes shape row-by-row and caps it at 64', () => {
    const repaired = parseVisualSubjectCatalog({
      primarySubjectId: 'subject-nvidia',
      subjects: [nvidiaSubject()],
      scenes: [
        null,
        {
          sceneId: 'scene-01',
          subjectId: 'subject-nvidia',
          visualCue: '  chip   launch keynote  ',
        },
        ...Array.from({ length: 80 }, (_value, index) => ({
          sceneId: `scene-${String((index % 64) + 1).padStart(2, '0')}`,
          subjectId: null,
          visualCue: 'server rack aisle',
        })),
      ],
    });
    expect(repaired.sceneCues?.[0]?.visualCue).toBe('chip launch keynote');
    expect(repaired.sceneCues?.length).toBeLessThanOrEqual(64);
  });
});

describe('visual cue candidate scoring', () => {
  it('scores whole cue tokens and caps the bonus', () => {
    expect(
      searchCueScore(candidate('NVIDIA stock chart plunge'), 'stock chart'),
    ).toBe(CUE_TOKEN_BONUS * 2);
    expect(
      searchCueScore(
        candidate('stock chart plunge market selloff'),
        'stock chart plunge market',
      ),
    ).toBe(MAX_CUE_BONUS);
  });

  it('does not match a cue token inside a longer word', () => {
    expect(searchCueScore(candidate('charter flight'), 'stock chart')).toBe(0);
  });

  it('lets a donor query overlap a cue even when the base query does not', () => {
    expect(
      fallbackEntryMatchesSceneQuery(
        { requestQuery: 'market plunge Reuters photo' },
        {
          imageSearchIntent: ['NVIDIA GPU maker'],
          imageSearchEntities: ['NVIDIA'],
          visualCue: 'stock chart plunge',
          searchAnchor: 'context',
        },
      ),
    ).toBe(true);
  });
});
