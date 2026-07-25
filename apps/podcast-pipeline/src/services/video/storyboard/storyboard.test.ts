import OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';

import type { CanonicalAudioTiming } from '../audio-analysis.js';
import { OUTRO_TAIL_MS } from '../manifest.js';
import type { SceneSentenceAlignment } from '../scene-alignment.js';
import { MAX_STORYBOARD_SLIDES, type StoryboardDraft } from './draft.js';
import {
  createDeterministicStoryboard,
  createDeterministicStoryboardProvider,
} from './fallback.js';
import {
  materializeLocaleVideoManifest,
  TRUSTED_RENDERER_VERSION,
} from './materialize.js';
import {
  buildNvidiaStoryboardSystemPrompt,
  buildNvidiaStoryboardUserPrompt,
  createNvidiaStoryboardProvider,
} from './nvidia.js';
import { generateStoryboard } from './orchestrator.js';
import type {
  StoryboardProvider,
  StoryboardProviderOptions,
  StoryboardProviderRequest,
} from './provider.js';
import {
  canonicalSentenceRangeText,
  splitCanonicalSentences,
} from './sentences.js';
import {
  storyboardSceneCountRange,
  validateStoryboardDraft,
} from './validation.js';
import {
  IMAGE_VISUAL_PLAN_VERSION,
  materializeImageVisualPlan,
  stableSceneId,
} from './visual-plan.js';

const script = [
  '今天先看市場流動性的變化。',
  '第一個訊號來自美元資金成本。',
  '接著觀察國債市場的期限溢價。',
  '投資人也重新評估風險資產。',
  '鏈上交易量同步出現回升。',
  '穩定幣供給提供另一個線索。',
  '交易所的深度仍需要持續追蹤。',
  '短期波動不代表趨勢已經反轉。',
  '風險管理仍然是最重要的原則。',
  '最後請留意下一次政策會議。',
].join('');

function fallbackDraft(): StoryboardDraft {
  return createDeterministicStoryboard({
    title: '市場流動性觀察',
    script,
    durationMs: 90_000,
    sentences: splitCanonicalSentences(script),
  });
}

function sceneSource(sceneId: string) {
  return {
    id: `${sceneId}-source`,
    label: `${sceneId} source page`,
    url: `https://news.example.test/${sceneId}`,
    attribution: 'Example News',
    license: 'unknown' as const,
    licenseUrl: null,
  };
}

function sceneAsset(sceneId: string) {
  return {
    kind: 'remoteImage' as const,
    sourceId: `${sceneId}-source`,
    url: `https://images.example.test/${sceneId}.jpg`,
    sha256: 'a'.repeat(64),
    layout: 'fullBleed' as const,
    position: 'center' as const,
  };
}

describe('canonical storyboard sentences', () => {
  it('creates stable IDs and preserves exact canonical ranges', () => {
    const sentences = splitCanonicalSentences(` 前句。\n\n後句！ `);
    expect(sentences.map(({ id, text }) => ({ id, text }))).toEqual([
      { id: 's0001', text: '前句。' },
      { id: 's0002', text: '後句！' },
    ]);
    expect(
      canonicalSentenceRangeText(
        ` 前句。\n\n後句！ `,
        sentences,
        's0001',
        's0002',
      ),
    ).toBe('前句。\n\n後句！');
  });

  it('splits English periods without splitting decimals, domains, or initials', () => {
    const sentences = splitCanonicalSentences(
      'Markets rose 3.14 percent. Visit example.com. U.S. yields fell. Done.',
    );
    expect(sentences.map((sentence) => sentence.text)).toEqual([
      'Markets rose 3.14 percent.',
      'Visit example.com.',
      'U.S. yields fell.',
      'Done.',
    ]);
  });
});

describe('image-only storyboard validation and fallback', () => {
  it('builds a deterministic 90-second plan with stable scenes and no copy', () => {
    const sentences = splitCanonicalSentences(script);
    const draft = fallbackDraft();
    const validation = validateStoryboardDraft(draft, {
      script,
      sentences,
      durationMs: 90_000,
    });

    expect(validation.success).toBe(true);
    expect(draft.scenes.length).toBeGreaterThanOrEqual(8);
    expect(draft.scenes.length).toBeLessThanOrEqual(10);
    expect(draft.scenes.map((scene) => scene.sceneId)).toEqual(
      draft.scenes.map((_, index) => stableSceneId(index)),
    );
    expect(draft.scenes.at(-1)?.endSentenceId).toBe('s0010');
    expect(
      draft.scenes.every((scene) => scene.imageSearchIntent.length > 0),
    ).toBe(true);
    expect(JSON.stringify(draft)).not.toMatch(
      /headline|subheadline|quote|facts|citation|evidenceText|template/,
    );
  });

  it('uses balanced English search groups without changing canonical scene anchors', async () => {
    const canonicalScript = [
      '市場流動性持續變化。',
      '政策預期影響債券。',
      '企業投資評估風險。',
      '能源轉型帶動需求。',
    ].join('');
    const englishScript = [
      'Solar panels expand.',
      'Battery factories expand.',
      'Cargo ports modernize.',
      'Freight railways modernize.',
      'Data centers scale.',
      'Cooling systems improve.',
      'Forest restoration accelerates.',
      'Wetland habitats recover.',
    ].join(' ');
    const sentences = splitCanonicalSentences(canonicalScript);
    const request: StoryboardProviderRequest = {
      title: '全球基礎建設趨勢',
      script: canonicalScript,
      durationMs: 36_000,
      sentences,
    };
    const canonicalDraft = createDeterministicStoryboard(request);
    const generated = await createDeterministicStoryboardProvider({
      searchTitle: 'Global infrastructure outlook',
      searchScript: englishScript,
    }).generate(request);
    const englishSearchDraft = generated.draft as StoryboardDraft;

    const anchors = (draft: StoryboardDraft) =>
      draft.scenes.map(({ sceneId, startSentenceId, endSentenceId }) => ({
        sceneId,
        startSentenceId,
        endSentenceId,
      }));
    expect(anchors(englishSearchDraft)).toEqual(anchors(canonicalDraft));
    expect(englishSearchDraft.scenes).toHaveLength(4);
    expect(englishSearchDraft.scenes[0]!.imageSearchIntent.join(' ')).toContain(
      'Solar panels',
    );
    expect(englishSearchDraft.scenes[1]!.imageSearchIntent.join(' ')).toContain(
      'Cargo ports',
    );
    expect(englishSearchDraft.scenes[2]!.imageSearchIntent.join(' ')).toContain(
      'Data centers',
    );
    expect(englishSearchDraft.scenes[3]!.imageSearchIntent.join(' ')).toContain(
      'Wetland habitats',
    );
    expect(
      englishSearchDraft.scenes
        .flatMap((scene) => scene.imageSearchIntent)
        .join(' '),
    ).not.toMatch(/市場|政策|企業|能源/u);
    expect(
      validateStoryboardDraft(englishSearchDraft, {
        script: canonicalScript,
        sentences,
        durationMs: 36_000,
      }).success,
    ).toBe(true);
  });

  it('maps filler narration to a concrete photographic subject from the article topic', async () => {
    const canonicalScript = '問題自然而然地出現。';
    const request: StoryboardProviderRequest = {
      title: '加密領域還能開發什麼？',
      script: canonicalScript,
      durationMs: 9_000,
      sentences: splitCanonicalSentences(canonicalScript),
    };
    const generated = await createDeterministicStoryboardProvider({
      searchTitle: 'Wintermute: What else can be built in crypto?',
      searchScript: 'The question naturally arises.',
    }).generate(request);
    const intent = (generated.draft as StoryboardDraft).scenes[0]!
      .imageSearchIntent[0]!;

    expect(intent).toBe('blockchain developers office photo');
    expect(intent).not.toMatch(/question|naturally|arises/u);
  });

  it('turns a Chinese podcast intro into topic-anchored search keywords', () => {
    const intro =
      '好的，各位聽眾朋友，今天我們來聊加密建設者如何塑造區塊鏈未來。';
    const draft = createDeterministicStoryboard({
      title: '加密產業趨勢',
      script: intro,
      durationMs: 9_000,
      sentences: splitCanonicalSentences(intro),
    });
    const intents = draft.scenes[0]!.imageSearchIntent;

    expect(intents.length).toBeGreaterThanOrEqual(1);
    expect(intents.length).toBeLessThanOrEqual(3);
    expect(
      intents.every((intent) => {
        const length = Array.from(intent).length;
        return length >= 2 && length <= 80;
      }),
    ).toBe(true);
    expect(intents[0]).toContain('加密建設者');
    expect(intents[0]).toContain('區塊鏈未來');
    expect(intents.join(' ')).not.toMatch(
      /好的|各位|聽眾|朋友|今天|我們|來聊|如何|塑造/,
    );
    expect(intents).not.toContain(intro.replace(/。$/u, ''));
  });

  it('preserves grounded technical names and numbers without copying prose', () => {
    const technicalScript = 'Ethereum Dencun 升級讓 Layer 2 交易費用下降 90%。';
    const sentences = splitCanonicalSentences(technicalScript);
    const draft = createDeterministicStoryboard({
      title: 'Ethereum Dencun 升級',
      script: technicalScript,
      durationMs: 9_000,
      sentences,
    });
    const intents = draft.scenes[0]!.imageSearchIntent;

    expect(intents[0]).toContain('Ethereum Dencun');
    expect(intents[0]).toContain('Layer 2');
    expect(intents[0]).toContain('90%');
    expect(intents[0]).toContain('blockchain developers office photo');
    expect(intents.join(' ')).not.toContain('讓');
    expect(intents).not.toContain(technicalScript.replace(/。$/u, ''));
    expect(
      validateStoryboardDraft(draft, {
        script: technicalScript,
        sentences,
        durationMs: 9_000,
      }).success,
    ).toBe(true);
  });

  it('caps long and extreme-duration plans at 64 scenes', () => {
    const longScript = Array.from(
      { length: 120 },
      (_, index) => `第${String(index + 1)}項市場觀察持續變化。`,
    ).join('');
    const sentences = splitCanonicalSentences(longScript);
    const draft = createDeterministicStoryboard({
      title: '長篇市場觀察',
      script: longScript,
      durationMs: 12 * 60_000,
      sentences,
    });
    expect(
      validateStoryboardDraft(draft, {
        script: longScript,
        sentences,
        durationMs: 12 * 60_000,
      }).success,
    ).toBe(true);
    expect(draft.scenes.length).toBeLessThanOrEqual(MAX_STORYBOARD_SLIDES);
    expect(draft.scenes.at(-1)?.endSentenceId).toBe('s0120');
    expect(storyboardSceneCountRange(24 * 60 * 60_000, 1_000)).toEqual({
      min: MAX_STORYBOARD_SLIDES,
      max: MAX_STORYBOARD_SLIDES,
    });
  });

  it('rejects unstable IDs, sentence gaps, and ungrounded numeric intents', () => {
    const sentences = splitCanonicalSentences(script);
    const draft = structuredClone(fallbackDraft());
    draft.scenes[0]!.sceneId = 'scene-08';
    draft.scenes[1]!.startSentenceId = 's0003';
    draft.scenes[1]!.endSentenceId = 's0003';
    draft.scenes[1]!.imageSearchIntent = ['新增 9999 人'];

    const validation = validateStoryboardDraft(draft, {
      script,
      sentences,
      durationMs: 90_000,
    });
    expect(validation.success).toBe(false);
    if (validation.success) throw new Error('Expected invalid storyboard');
    expect(validation.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'scenes.unstable_id',
        'sentences.coverage',
        'intent.ungrounded_number',
      ]),
    );
  });

  it('rejects an empty image-search intent at the schema boundary', () => {
    const draft = structuredClone(fallbackDraft()) as unknown as {
      scenes: { imageSearchIntent: string[] }[];
    };
    draft.scenes[0]!.imageSearchIntent = [];
    const validation = validateStoryboardDraft(draft, {
      script,
      sentences: splitCanonicalSentences(script),
      durationMs: 90_000,
    });
    expect(validation.success).toBe(false);
    if (validation.success) throw new Error('Expected invalid storyboard');
    expect(validation.issues[0]?.path).toEqual([
      'scenes',
      0,
      'imageSearchIntent',
    ]);
  });
});

describe('storyboard provider orchestration', () => {
  it('repairs once, then falls back deterministically after invalid responses', async () => {
    const repairOptions: (StoryboardProviderOptions | undefined)[] = [];
    const provider: StoryboardProvider = {
      name: 'fixture',
      model: 'fixture-v1',
      generate: vi.fn(
        async (
          _request: StoryboardProviderRequest,
          options?: StoryboardProviderOptions,
        ) => {
          repairOptions.push(options);
          return { draft: { scenes: [] }, model: 'fixture-v1', usage: null };
        },
      ),
    };

    const result = await generateStoryboard({
      title: '市場流動性觀察',
      script,
      durationMs: 90_000,
      provider,
    });
    expect(result.usedFallback).toBe(true);
    expect(result.effectiveProvider).toBe('deterministic');
    expect(result.attempts).toHaveLength(2);
    expect(repairOptions[0]?.repairIssues).toBeUndefined();
    expect(repairOptions[1]?.repairIssues?.length).toBeGreaterThan(0);
  });

  it('accepts a valid provider plan without a fallback', async () => {
    const result = await generateStoryboard({
      title: '市場流動性觀察',
      script,
      durationMs: 90_000,
      provider: createDeterministicStoryboardProvider(),
    });
    expect(result.effectiveProvider).toBe('deterministic');
    expect(result.usedFallback).toBe(false);
  });
});

describe('NVIDIA storyboard provider', () => {
  it('requests only scene anchors and image-search intents', async () => {
    const draft = fallbackDraft();
    const create = vi.fn().mockResolvedValue({
      model: 'nvidia/test-model',
      choices: [{ message: { content: JSON.stringify(draft) } }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      },
    });
    const client = {
      chat: { completions: { create } },
    } as unknown as OpenAI;
    const provider = createNvidiaStoryboardProvider({
      model: 'nvidia/test-model',
      client,
    });
    const sentences = splitCanonicalSentences(script);

    await expect(
      provider.generate({
        title: '市場流動性觀察',
        script,
        durationMs: 90_000,
        sentences,
      }),
    ).resolves.toMatchObject({
      draft,
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      model: 'nvidia/test-model',
      temperature: 0.2,
      max_tokens: 2_000,
      response_format: { type: 'json_object' },
    });
    const systemPrompt = buildNvidiaStoryboardSystemPrompt();
    expect(systemPrompt).toMatch(/^\/no_think/);
    expect(systemPrompt).toContain('sceneId');
    expect(systemPrompt).toContain('imageSearchIntent');
    expect(systemPrompt).toContain('不得寫旁白');
    expect(
      buildNvidiaStoryboardUserPrompt(
        {
          title: '市場流動性觀察',
          script,
          durationMs: 90_000,
          sentences,
        },
        {
          repairIssues: [
            { code: 'test', path: ['scenes', 1], message: '修正範圍' },
          ],
        },
      ),
    ).toContain('修正範圍');
  });
});

describe('shared visual plan and locale manifest materialization', () => {
  it('requires one remote image per scene and preserves its provenance', () => {
    const draft: StoryboardDraft = {
      scenes: [
        {
          sceneId: 'scene-01',
          startSentenceId: 's0001',
          endSentenceId: 's0001',
          imageSearchIntent: ['market trading floor'],
        },
        {
          sceneId: 'scene-02',
          startSentenceId: 's0002',
          endSentenceId: 's0002',
          imageSearchIntent: ['central bank building'],
        },
      ],
    };
    expect(() =>
      materializeImageVisualPlan({
        draft,
        sceneAssets: [
          {
            sceneId: 'scene-01',
            sources: [sceneSource('scene-01')],
            asset: sceneAsset('scene-01'),
          },
        ],
      }),
    ).toThrow('Expected 2 materialized scene assets');

    const visualPlan = materializeImageVisualPlan({
      draft,
      sceneAssets: draft.scenes.map((scene) => ({
        sceneId: scene.sceneId,
        sources: [sceneSource(scene.sceneId)],
        asset: sceneAsset(scene.sceneId),
      })),
    });
    expect(visualPlan.schemaVersion).toBe(IMAGE_VISUAL_PLAN_VERSION);
    expect(visualPlan.scenes[0]).toMatchObject({
      sceneId: 'scene-01',
      sources: [{ attribution: 'Example News', license: 'unknown' }],
      asset: {
        kind: 'remoteImage',
        url: 'https://images.example.test/scene-01.jpg',
        layout: 'fullBleed',
      },
    });
  });

  it('combines the shared assets with locale timing and alignment', () => {
    const localizedSentences = splitCanonicalSentences(
      'Markets changed. Policy followed.',
    );
    const timing: CanonicalAudioTiming = {
      durationMs: 20_000,
      sentences: [
        {
          sentence: localizedSentences[0]!,
          startMs: 0,
          endMs: 10_000,
        },
        {
          sentence: localizedSentences[1]!,
          startMs: 10_000,
          endMs: 20_000,
        },
      ],
      captions: [
        { startMs: 0, endMs: 10_000, text: 'Markets changed.' },
        { startMs: 10_000, endMs: 20_000, text: 'Policy followed.' },
      ],
      silences: [],
    };
    const draft: StoryboardDraft = {
      scenes: localizedSentences.map((sentence, index) => ({
        sceneId: stableSceneId(index),
        startSentenceId: sentence.id,
        endSentenceId: sentence.id,
        imageSearchIntent: [`image intent ${index + 1}`],
      })),
    };
    const visualPlan = materializeImageVisualPlan({
      draft,
      sceneAssets: draft.scenes.map((scene) => ({
        sceneId: scene.sceneId,
        sources: [sceneSource(scene.sceneId)],
        asset: sceneAsset(scene.sceneId),
      })),
    });
    const sceneAlignment: SceneSentenceAlignment[] = draft.scenes.map(
      (scene) => ({
        sceneId: scene.sceneId,
        startSentenceId: scene.startSentenceId,
        endSentenceId: scene.endSentenceId,
      }),
    );

    const manifest = materializeLocaleVideoManifest({
      visualPlan,
      timing,
      sceneAlignment,
      episode: {
        id: '9ee737b4-c3d3-4f88-9837-ccc7fc20704e',
        localizationId: '56b21422-1a38-4917-957e-b23223c0396c',
        languageCode: 'en',
        title: 'Markets',
      },
      audioSource: '/audio/en.m4a',
    });

    expect(manifest.schemaVersion).toBe('podcast-slide-video.v3');
    expect(manifest.rendererVersion).toBe(TRUSTED_RENDERER_VERSION);
    expect(manifest.clip).toMatchObject({ width: 1080, height: 1920 });
    expect(manifest.audio.narrationDurationMs).toBe(20_000);
    expect(manifest.clip.durationMs).toBe(20_000 + OUTRO_TAIL_MS);
    expect(manifest.headline.titleLines).toEqual(['Markets']);
    expect(manifest.outro.startMs).toBe(20_000);
    expect(manifest.slides).toEqual([
      expect.objectContaining({
        id: 'scene-01',
        startMs: 0,
        endMs: 10_000,
        template: 'image',
        asset: visualPlan.scenes[0]!.asset,
        sources: visualPlan.scenes[0]!.sources,
      }),
      expect.objectContaining({
        id: 'scene-02',
        startMs: 10_000,
        endMs: 20_000,
        template: 'image',
        asset: visualPlan.scenes[1]!.asset,
        sources: visualPlan.scenes[1]!.sources,
      }),
    ]);
    expect(JSON.stringify(manifest.slides)).not.toMatch(
      /headline|quote|citation|facts|sourceQuote|statistic/,
    );
  });

  it('throws when scene alignment count mismatches visual plan scenes', () => {
    const sentences = splitCanonicalSentences('Markets changed.');
    const timing: CanonicalAudioTiming = {
      durationMs: 10_000,
      sentences: [{ sentence: sentences[0]!, startMs: 0, endMs: 10_000 }],
      captions: [{ startMs: 0, endMs: 10_000, text: 'Markets changed.' }],
      silences: [],
    };
    const draft: StoryboardDraft = {
      scenes: [
        {
          sceneId: 'scene-01',
          startSentenceId: 's0001',
          endSentenceId: 's0001',
          imageSearchIntent: ['test'],
        },
      ],
    };
    const visualPlan = materializeImageVisualPlan({
      draft,
      sceneAssets: [
        {
          sceneId: 'scene-01',
          sources: [sceneSource('scene-01')],
          asset: sceneAsset('scene-01'),
        },
      ],
    });
    expect(() =>
      materializeLocaleVideoManifest({
        visualPlan,
        timing,
        sceneAlignment: [],
        episode: {
          id: 'id',
          localizationId: 'loc',
          languageCode: 'en',
          title: 'T',
        },
        audioSource: '/audio/en.m4a',
      }),
    ).toThrow('Expected 1 aligned scenes, received 0');
  });

  it('throws when scene alignment sceneId mismatches', () => {
    const sentences = splitCanonicalSentences('Markets changed.');
    const timing: CanonicalAudioTiming = {
      durationMs: 10_000,
      sentences: [{ sentence: sentences[0]!, startMs: 0, endMs: 10_000 }],
      captions: [{ startMs: 0, endMs: 10_000, text: 'Markets changed.' }],
      silences: [],
    };
    const draft: StoryboardDraft = {
      scenes: [
        {
          sceneId: 'scene-01',
          startSentenceId: 's0001',
          endSentenceId: 's0001',
          imageSearchIntent: ['test'],
        },
      ],
    };
    const visualPlan = materializeImageVisualPlan({
      draft,
      sceneAssets: [
        {
          sceneId: 'scene-01',
          sources: [sceneSource('scene-01')],
          asset: sceneAsset('scene-01'),
        },
      ],
    });
    expect(() =>
      materializeLocaleVideoManifest({
        visualPlan,
        timing,
        sceneAlignment: [
          {
            sceneId: 'scene-99',
            startSentenceId: 's0001',
            endSentenceId: 's0001',
          },
        ],
        episode: {
          id: 'id',
          localizationId: 'loc',
          languageCode: 'en',
          title: 'T',
        },
        audioSource: '/audio/en.m4a',
      }),
    ).toThrow('Scene alignment 1 must reference scene-01');
  });

  it('throws when scene alignment references unknown locale sentence', () => {
    const sentences = splitCanonicalSentences('Markets changed.');
    const timing: CanonicalAudioTiming = {
      durationMs: 10_000,
      sentences: [{ sentence: sentences[0]!, startMs: 0, endMs: 10_000 }],
      captions: [{ startMs: 0, endMs: 10_000, text: 'Markets changed.' }],
      silences: [],
    };
    const draft: StoryboardDraft = {
      scenes: [
        {
          sceneId: 'scene-01',
          startSentenceId: 's0001',
          endSentenceId: 's0001',
          imageSearchIntent: ['test'],
        },
      ],
    };
    const visualPlan = materializeImageVisualPlan({
      draft,
      sceneAssets: [
        {
          sceneId: 'scene-01',
          sources: [sceneSource('scene-01')],
          asset: sceneAsset('scene-01'),
        },
      ],
    });
    expect(() =>
      materializeLocaleVideoManifest({
        visualPlan,
        timing,
        sceneAlignment: [
          {
            sceneId: 'scene-01',
            startSentenceId: 's0999',
            endSentenceId: 's0999',
          },
        ],
        episode: {
          id: 'id',
          localizationId: 'loc',
          languageCode: 'en',
          title: 'T',
        },
        audioSource: '/audio/en.m4a',
      }),
    ).toThrow('references an unknown locale sentence');
  });

  it('throws when scene alignment is not contiguous', () => {
    const sentences = splitCanonicalSentences('First. Second.');
    const timing: CanonicalAudioTiming = {
      durationMs: 20_000,
      sentences: [
        { sentence: sentences[0]!, startMs: 0, endMs: 10_000 },
        { sentence: sentences[1]!, startMs: 10_000, endMs: 20_000 },
      ],
      captions: [
        { startMs: 0, endMs: 10_000, text: 'First.' },
        { startMs: 10_000, endMs: 20_000, text: 'Second.' },
      ],
      silences: [],
    };
    const draft: StoryboardDraft = {
      scenes: [
        {
          sceneId: 'scene-01',
          startSentenceId: 's0001',
          endSentenceId: 's0002',
          imageSearchIntent: ['test'],
        },
      ],
    };
    const visualPlan = materializeImageVisualPlan({
      draft,
      sceneAssets: [
        {
          sceneId: 'scene-01',
          sources: [sceneSource('scene-01')],
          asset: sceneAsset('scene-01'),
        },
      ],
    });
    expect(() =>
      materializeLocaleVideoManifest({
        visualPlan,
        timing,
        sceneAlignment: [
          {
            sceneId: 'scene-01',
            startSentenceId: 's0002',
            endSentenceId: 's0002',
          },
        ],
        episode: {
          id: 'id',
          localizationId: 'loc',
          languageCode: 'en',
          title: 'T',
        },
        audioSource: '/audio/en.m4a',
      }),
    ).toThrow('must cover the next contiguous locale sentence range');
  });

  it('throws when scene alignment does not cover every locale sentence', () => {
    const sentences = splitCanonicalSentences('First. Second.');
    const timing: CanonicalAudioTiming = {
      durationMs: 20_000,
      sentences: [
        { sentence: sentences[0]!, startMs: 0, endMs: 10_000 },
        { sentence: sentences[1]!, startMs: 10_000, endMs: 20_000 },
      ],
      captions: [
        { startMs: 0, endMs: 10_000, text: 'First.' },
        { startMs: 10_000, endMs: 20_000, text: 'Second.' },
      ],
      silences: [],
    };
    const draft: StoryboardDraft = {
      scenes: [
        {
          sceneId: 'scene-01',
          startSentenceId: 's0001',
          endSentenceId: 's0001',
          imageSearchIntent: ['test'],
        },
      ],
    };
    const visualPlan = materializeImageVisualPlan({
      draft,
      sceneAssets: [
        {
          sceneId: 'scene-01',
          sources: [sceneSource('scene-01')],
          asset: sceneAsset('scene-01'),
        },
      ],
    });
    expect(() =>
      materializeLocaleVideoManifest({
        visualPlan,
        timing,
        sceneAlignment: [
          {
            sceneId: 'scene-01',
            startSentenceId: 's0001',
            endSentenceId: 's0001',
          },
        ],
        episode: {
          id: 'id',
          localizationId: 'loc',
          languageCode: 'en',
          title: 'T',
        },
        audioSource: '/audio/en.m4a',
      }),
    ).toThrow('Scene alignment must cover every locale sentence');
  });

  it('rejects a scene index below zero', () => {
    expect(() => stableSceneId(-1)).toThrow(
      'Scene index must be an integer from 0 to 63',
    );
  });

  it('rejects duplicate scene asset IDs', () => {
    const draft: StoryboardDraft = {
      scenes: [
        {
          sceneId: 'scene-01',
          startSentenceId: 's0001',
          endSentenceId: 's0001',
          imageSearchIntent: ['test'],
        },
        {
          sceneId: 'scene-02',
          startSentenceId: 's0002',
          endSentenceId: 's0002',
          imageSearchIntent: ['test 2'],
        },
      ],
    };
    expect(() =>
      materializeImageVisualPlan({
        draft,
        sceneAssets: [
          {
            sceneId: 'scene-01',
            sources: [sceneSource('scene-01')],
            asset: sceneAsset('scene-01'),
          },
          {
            sceneId: 'scene-01',
            sources: [sceneSource('scene-01')],
            asset: sceneAsset('scene-01'),
          },
        ],
      }),
    ).toThrow('Materialized scene assets contain duplicate scene IDs');
  });

  it('rejects a draft scene with no matching scene asset', () => {
    const draft: StoryboardDraft = {
      scenes: [
        {
          sceneId: 'scene-01',
          startSentenceId: 's0001',
          endSentenceId: 's0001',
          imageSearchIntent: ['test'],
        },
        {
          sceneId: 'scene-02',
          startSentenceId: 's0002',
          endSentenceId: 's0002',
          imageSearchIntent: ['test 2'],
        },
      ],
    };
    expect(() =>
      materializeImageVisualPlan({
        draft,
        sceneAssets: [
          {
            sceneId: 'scene-01',
            sources: [sceneSource('scene-01')],
            asset: sceneAsset('scene-01'),
          },
          {
            sceneId: 'scene-03',
            sources: [sceneSource('scene-01')],
            asset: sceneAsset('scene-01'),
          },
        ],
      }),
    ).toThrow('Materialized image is missing for scene-02');
  });
});
