import { describe, expect, it, vi } from 'vitest';

import type { StoryboardDraft } from './draft.js';
import {
  enrichStoryboardSearchIntents,
  type SearchIntentProvider,
} from './search-intents.js';

function draft(): StoryboardDraft {
  return {
    scenes: [
      {
        sceneId: 'scene-01',
        startSentenceId: 's0001',
        endSentenceId: 's0001',
        imageSearchIntent: ['placeholder'],
      },
      {
        sceneId: 'scene-02',
        startSentenceId: 's0002',
        endSentenceId: 's0002',
        imageSearchIntent: ['placeholder'],
      },
    ],
  };
}

describe('production subject-catalog-only search enrichment', () => {
  it('uses catalog evidence deterministically and never numeric-validates a16z', async () => {
    const suggest = vi.fn().mockRejectedValue(
      new Error('per-scene LLM must not run on the production v8 path'),
    );
    const provider: SearchIntentProvider = {
      model: 'test-model',
      subjectCatalogOnly: true,
      catalog: vi.fn().mockResolvedValue({
        primarySubjectId: 'subject-a16z',
        subjects: [
          {
            id: 'subject-a16z',
            canonicalName: 'a16z',
            type: 'company',
            aliases: ['Andreessen Horowitz'],
            storyRole: 'primary',
            evidenceSceneIds: ['scene-01'],
            searchQueries: ['a16z'],
            identityHints: ['venture capital'],
            negativeHints: [],
            officialDomains: [],
          },
        ],
      }),
      suggest,
    };

    const result = await enrichStoryboardSearchIntents(
      {
        draft: draft(),
        title: 'a16z AI writing guide',
        script:
          'a16z published an AI writing guide. The guide discusses editing.',
        durationMs: 20_000,
      },
      { provider },
    );

    expect(suggest).not.toHaveBeenCalled();
    expect(result.subjectCatalog?.primarySubjectId).toBe('subject-a16z');
    expect(result.sceneAssignments).toEqual([
      {
        sceneId: 'scene-01',
        subjectIds: ['subject-a16z'],
        selectionReason: 'direct',
      },
      {
        sceneId: 'scene-02',
        subjectIds: ['subject-a16z'],
        selectionReason: 'section-context',
      },
    ]);
    expect(result.draft.scenes[0]?.imageSearchIntent).toContain('a16z');
    expect(result.draft.scenes[1]?.imageSearchIntent).toContain('a16z');
  });
});
