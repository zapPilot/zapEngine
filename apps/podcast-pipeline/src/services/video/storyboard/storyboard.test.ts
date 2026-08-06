import { describe, expect, it } from 'vitest';

import { createDeterministicStoryboard } from './fallback.js';
import {
  buildNvidiaStoryboardSystemPrompt,
  buildNvidiaStoryboardUserPrompt,
} from './nvidia.js';
import { splitCanonicalSentences } from './sentences.js';
import { validateStoryboardDraft } from './validation.js';
import {
  HYBRID_VISUAL_PLAN_VERSION,
  materializeHybridVisualPlan,
} from './visual-plan.js';

describe('hybrid storyboard', () => {
  it('uses a diagram for an abstract causal mechanism', () => {
    const script = '聯準會放慢縮表，因此市場美元流動性壓力下降。';
    const sentences = splitCanonicalSentences(script);
    const draft = createDeterministicStoryboard({
      title: '聯準會與流動性',
      script,
      durationMs: 10_000,
      sentences,
    });

    expect(draft.scenes).toHaveLength(1);
    expect(draft.scenes[0]?.visual.kind).toBe('diagram');
    if (draft.scenes[0]?.visual.kind === 'diagram') {
      expect(draft.scenes[0].visual.layout).toBe('flow');
      expect(draft.scenes[0].visual.nodes.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('uses a data card for a grounded standalone metric', () => {
    const script = '聯邦基金利率目前是 5.25%。';
    const sentences = splitCanonicalSentences(script);
    const draft = createDeterministicStoryboard({
      title: '利率觀察',
      script,
      durationMs: 10_000,
      sentences,
    });

    expect(draft.scenes[0]?.visual).toMatchObject({
      kind: 'dataCard',
      value: '5.25%',
    });
  });

  it('uses a photo only for a concrete documented event', () => {
    const script = 'Coinbase 宣布推出新的支付產品。';
    const sentences = splitCanonicalSentences(script);
    const draft = createDeterministicStoryboard({
      title: 'Coinbase 發布會',
      script,
      durationMs: 10_000,
      sentences,
    });

    expect(draft.scenes[0]?.visual.kind).toBe('photo');
    if (draft.scenes[0]?.visual.kind === 'photo') {
      expect(draft.scenes[0].visual.searchIntents.length).toBeGreaterThan(0);
      expect(draft.scenes[0].visual.mustShowEntities.length).toBeGreaterThan(0);
    }
  });

  it('rejects numbers absent from the canonical scene range', () => {
    const script = '市場流動性正在下降。';
    const sentences = splitCanonicalSentences(script);
    const result = validateStoryboardDraft(
      {
        scenes: [
          {
            sceneId: 'scene-01',
            startSentenceId: 's0001',
            endSentenceId: 's0001',
            visual: {
              kind: 'dataCard',
              value: '9999',
              label: '市場流動性',
            },
          },
        ],
      },
      { script, sentences, durationMs: 10_000 },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.issues.some(
          (issue) => issue.code === 'visual.ungrounded_number',
        ),
      ).toBe(true);
    }
  });

  it('materializes mixed visuals and explicitly falls back from missing photos', () => {
    const plan = materializeHybridVisualPlan({
      draft: {
        scenes: [
          {
            sceneId: 'scene-01',
            startSentenceId: 's0001',
            endSentenceId: 's0001',
            visual: {
              kind: 'photo',
              searchIntents: ['Coinbase product launch'],
              mustShowEntities: ['Coinbase'],
            },
          },
          {
            sceneId: 'scene-02',
            startSentenceId: 's0002',
            endSentenceId: 's0002',
            visual: {
              kind: 'diagram',
              layout: 'flow',
              nodes: [
                { id: 'policy', label: '政策' },
                { id: 'market', label: '市場' },
              ],
              edges: [{ from: 'policy', to: 'market' }],
            },
          },
          {
            sceneId: 'scene-03',
            startSentenceId: 's0003',
            endSentenceId: 's0003',
            visual: { kind: 'dataCard', value: '5%', label: '利率' },
          },
        ],
      },
      photoAssets: [],
      photoFallbacks: [{ sceneId: 'scene-01', reason: 'no-grounded-photo' }],
    });

    expect(plan.schemaVersion).toBe(HYBRID_VISUAL_PLAN_VERSION);
    expect(plan.scenes.map((scene) => scene.actualKind)).toEqual([
      'diagram',
      'diagram',
      'dataCard',
    ]);
    expect(plan.scenes[0]).toMatchObject({
      fallbackFrom: 'photo',
      fallbackReason: 'no-grounded-photo',
    });
  });

  it('prompts the provider to select modality before content', () => {
    const systemPrompt = buildNvidiaStoryboardSystemPrompt();
    expect(systemPrompt).toContain('photo');
    expect(systemPrompt).toContain('diagram');
    expect(systemPrompt).toContain('dataCard');
    expect(systemPrompt).toContain('generic office');

    const script = '政策導致流動性下降。';
    const userPrompt = buildNvidiaStoryboardUserPrompt({
      title: '政策傳導',
      script,
      durationMs: 10_000,
      sentences: splitCanonicalSentences(script),
    });
    expect(userPrompt).toContain('Canonical sentences');
  });
});
