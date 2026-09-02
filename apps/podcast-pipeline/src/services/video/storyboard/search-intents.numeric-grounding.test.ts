import { describe, expect, it, vi } from 'vitest';

import { createDeterministicStoryboard } from './fallback.js';
import {
  enrichStoryboardSearchIntents,
  type SearchIntentProvider,
} from './search-intents.js';
import { splitCanonicalSentences } from './sentences.js';

const DURATION_MS = 300_000;

describe('visual subject catalog numeric grounding', () => {
  it('drops hallucinated numeric catalog queries before the per-scene cap and keeps the canonical fallback', async () => {
    const script = Array.from(
      { length: 30 },
      (_value, index) => `第${index + 1}段報導CNBC透露最新市場政策方向。`,
    ).join('');
    const sentences = splitCanonicalSentences(script);
    const draft = createDeterministicStoryboard({
      title: 'CNBC 市場政策最新發展',
      script,
      durationMs: DURATION_MS,
      sentences,
    });
    const provider: SearchIntentProvider = {
      model: 'openrouter/test-model',
      catalog: vi.fn(() =>
        Promise.resolve({
          primarySubjectId: 'subject-cnbc',
          subjects: [
            {
              id: 'subject-cnbc',
              canonicalName: 'CNBC',
              type: 'company',
              aliases: [],
              storyRole: 'primary',
              evidenceSceneIds: ['scene-01'],
              searchQueries: [
                'CNBC 2024 newsroom',
                'CNBC 2024 journalists',
                'CNBC 2024 broadcast',
              ],
              identityHints: ['financial news network'],
              negativeHints: [],
              officialDomains: [],
            },
          ],
        }),
      ),
      suggest: vi.fn((request) =>
        Promise.resolve({
          scenes: request.scenes.map((scene) => ({
            sceneId: scene.sceneId,
            subjectIds: ['subject-cnbc'],
            imageSearchIntent: ['financial newsroom journalists'],
            entities: ['CNBC'],
          })),
        }),
      ),
    };

    const result = await enrichStoryboardSearchIntents(
      {
        draft,
        title: 'CNBC 市場政策最新發展',
        script,
        durationMs: DURATION_MS,
      },
      { provider },
    );

    expect(result.draft.scenes).toHaveLength(draft.scenes.length);
    expect(
      result.draft.scenes.every(
        (scene) =>
          scene.imageSearchIntent.length === 1 &&
          scene.imageSearchIntent[0] === 'CNBC',
      ),
    ).toBe(true);
    expect(
      result.draft.scenes.some((scene) =>
        scene.imageSearchIntent.some((intent) => intent.includes('2024')),
      ),
    ).toBe(false);
  });
});
