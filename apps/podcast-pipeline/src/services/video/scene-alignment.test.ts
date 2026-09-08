import { afterEach, describe, expect, it, vi } from 'vitest';

const llmMocks = vi.hoisted(() => ({
  createOpenRouterChatCompletion: vi.fn(),
  getOpenRouterConfig: vi.fn(),
  openai: {},
}));

vi.mock('../llm.js', () => ({
  createOpenRouterChatCompletion: llmMocks.createOpenRouterChatCompletion,
  getOpenRouterConfig: llmMocks.getOpenRouterConfig,
}));

import {
  alignLocalizedScenes,
  canonicalSceneAlignment,
  configuredSceneAlignmentProvider,
  createOpenRouterSceneAlignmentProvider,
  proportionalSceneAlignment,
  validateSceneAlignment,
  type VisualSceneAnchor,
} from './scene-alignment.js';

afterEach(() => {
  vi.clearAllMocks();
});

const scenes: VisualSceneAnchor[] = [
  {
    sceneId: 'scene-01',
    startSentenceId: 's0001',
    endSentenceId: 's0001',
  },
  {
    sceneId: 'scene-02',
    startSentenceId: 's0002',
    endSentenceId: 's0003',
  },
];

describe('scene alignment', () => {
  it('handles proportional alignment boundary validation', () => {
    expect(proportionalSceneAlignment([], [], [])).toEqual([]);
    expect(() =>
      proportionalSceneAlignment(scenes, [], ['s0001', 's0002']),
    ).toThrow('non-empty sentences');
    expect(() => proportionalSceneAlignment(scenes, ['s0001'], [])).toThrow(
      'non-empty sentences',
    );
    expect(() =>
      proportionalSceneAlignment(
        scenes,
        ['s0001', 's0002', 's0003'],
        ['s0001'],
      ),
    ).toThrow('at least one localized sentence per scene');
    expect(() =>
      proportionalSceneAlignment(
        [
          {
            sceneId: 'scene-01',
            startSentenceId: 's0001',
            endSentenceId: 's9999',
          },
        ],
        ['s0001'],
        ['s0001'],
      ),
    ).toThrow('unknown canonical sentence');
    expect(() =>
      proportionalSceneAlignment(
        [
          {
            sceneId: 'scene-01',
            startSentenceId: 's0001',
            endSentenceId: 's0001',
          },
        ],
        ['s0001'],
        [''],
      ),
    ).toThrow('invalid proportional range');
  });

  it('uses canonical sentence ranges without a provider call', () => {
    expect(canonicalSceneAlignment(scenes, '第一句。第二句。第三句。')).toEqual(
      scenes,
    );
  });

  it('rejects empty scripts and invalid canonical scene ranges before provider calls', async () => {
    const provider = { align: vi.fn() };
    await expect(
      alignLocalizedScenes(
        {
          canonicalScript: '',
          localizedScript: 'First.',
          languageCode: 'en',
          scenes: [],
        },
        { provider },
      ),
    ).rejects.toThrow('non-empty scripts');
    await expect(
      alignLocalizedScenes(
        {
          canonicalScript: 'First.',
          localizedScript: '',
          languageCode: 'en',
          scenes: [],
        },
        { provider },
      ),
    ).rejects.toThrow('non-empty scripts');
    await expect(
      alignLocalizedScenes(
        {
          canonicalScript: 'First.',
          localizedScript: 'Localized.',
          languageCode: 'en',
          scenes: [
            {
              sceneId: 'scene-01',
              startSentenceId: 's9999',
              endSentenceId: 's9999',
            },
          ],
        },
        { provider },
      ),
    ).rejects.toThrow('invalid canonical sentence range');
    expect(provider.align).not.toHaveBeenCalled();
  });

  it('aligns every localized sentence to the ordered shared scenes', async () => {
    const provider = {
      align: vi.fn(async () => ({
        scenes: [
          {
            sceneId: 'scene-01',
            startSentenceId: 's0001',
            endSentenceId: 's0002',
          },
          {
            sceneId: 'scene-02',
            startSentenceId: 's0003',
            endSentenceId: 's0004',
          },
        ],
      })),
    };

    await expect(
      alignLocalizedScenes(
        {
          canonicalScript: '第一句。第二句。第三句。',
          localizedScript:
            'First translated sentence! Second sentence! Third sentence! Fourth sentence!',
          languageCode: 'en',
          scenes,
        },
        { provider },
      ),
    ).resolves.toEqual([
      {
        sceneId: 'scene-01',
        startSentenceId: 's0001',
        endSentenceId: 's0002',
      },
      {
        sceneId: 'scene-02',
        startSentenceId: 's0003',
        endSentenceId: 's0004',
      },
    ]);
    expect(provider.align).toHaveBeenCalledOnce();
  });

  it('falls back to proportional alignment when semantic output is invalid', async () => {
    const provider = {
      align: vi.fn(async () => ({ endSentenceIds: ['s0001'] })),
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      alignLocalizedScenes(
        {
          canonicalScript: '第一句。第二句。第三句。',
          localizedScript: 'First. Second. Third. Fourth.',
          languageCode: 'en',
          scenes,
        },
        { provider },
      ),
    ).resolves.toEqual([
      {
        sceneId: 'scene-01',
        startSentenceId: 's0001',
        endSentenceId: 's0002',
      },
      {
        sceneId: 'scene-02',
        startSentenceId: 's0003',
        endSentenceId: 's0004',
      },
    ]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('preserves uneven canonical scene proportions deterministically', () => {
    expect(
      proportionalSceneAlignment(
        [
          {
            sceneId: 'scene-01',
            startSentenceId: 's0001',
            endSentenceId: 's0001',
          },
          {
            sceneId: 'scene-02',
            startSentenceId: 's0002',
            endSentenceId: 's0004',
          },
        ],
        ['s0001', 's0002', 's0003', 's0004'],
        ['s0001', 's0002', 's0003', 's0004', 's0005', 's0006'],
      ),
    ).toEqual([
      {
        sceneId: 'scene-01',
        startSentenceId: 's0001',
        endSentenceId: 's0002',
      },
      {
        sceneId: 'scene-02',
        startSentenceId: 's0003',
        endSentenceId: 's0006',
      },
    ]);
  });

  it('accepts top-level array alignment payloads', () => {
    expect(
      validateSceneAlignment(
        scenes,
        ['s0001', 's0002', 's0003'],
        [
          {
            sceneId: 'scene-01',
            startSentenceId: 's0001',
            endSentenceId: 's0001',
          },
          {
            sceneId: 'scene-02',
            startSentenceId: 's0002',
            endSentenceId: 's0003',
          },
        ],
      ),
    ).toHaveLength(2);
  });

  it('rejects malformed full alignment entries and unknown sentence ids', () => {
    for (const raw of [
      { scenes: ['bad', {}] },
      {
        scenes: [
          { sceneId: '', startSentenceId: 's0001', endSentenceId: 's0001' },
          {
            sceneId: 'scene-02',
            startSentenceId: 's0002',
            endSentenceId: 's0003',
          },
        ],
      },
      {
        scenes: [
          {
            sceneId: 'scene-01',
            startSentenceId: 's9999',
            endSentenceId: 's0001',
          },
          {
            sceneId: 'scene-02',
            startSentenceId: 's0002',
            endSentenceId: 's0003',
          },
        ],
      },
      null,
    ]) {
      expect(() =>
        validateSceneAlignment(scenes, ['s0001', 's0002', 's0003'], raw),
      ).toThrow();
    }
  });

  it('expands compact ending sentence IDs into contiguous scene ranges', () => {
    expect(
      validateSceneAlignment(scenes, ['s0001', 's0002', 's0003', 's0004'], {
        endSentenceIds: ['s0002', 's0004'],
      }),
    ).toEqual([
      {
        sceneId: 'scene-01',
        startSentenceId: 's0001',
        endSentenceId: 's0002',
      },
      {
        sceneId: 'scene-02',
        startSentenceId: 's0003',
        endSentenceId: 's0004',
      },
    ]);
  });

  it.each([
    { endSentenceIds: 'not-an-array' },
    { endSentenceIds: ['s0002'] },
    { endSentenceIds: [42, 's0004'] },
    { endSentenceIds: ['s9999', 's0004'] },
    { endSentenceIds: ['s0003', 's0002'] },
    { endSentenceIds: ['s0001', 's0003'] },
  ])('rejects invalid compact alignment %#', (raw) => {
    expect(() =>
      validateSceneAlignment(scenes, ['s0001', 's0002', 's0003', 's0004'], raw),
    ).toThrow(/Scene/);
  });

  it('requires localized ids when validating either compact or full payloads', () => {
    expect(() =>
      validateSceneAlignment(
        [
          {
            sceneId: 'scene-01',
            startSentenceId: 's0001',
            endSentenceId: 's0001',
          },
        ],
        [],
        { endSentenceIds: ['s0001'] },
      ),
    ).toThrow('requires localized sentences');
    expect(() =>
      validateSceneAlignment(
        [
          {
            sceneId: 'scene-01',
            startSentenceId: 's0001',
            endSentenceId: 's0001',
          },
        ],
        [],
        [
          {
            sceneId: 'scene-01',
            startSentenceId: 's0001',
            endSentenceId: 's0001',
          },
        ],
      ),
    ).toThrow('requires localized sentences');
  });

  it('always selects the OpenRouter alignment provider', () => {
    expect(configuredSceneAlignmentProvider()).toEqual(
      expect.objectContaining({ align: expect.any(Function) }),
    );
  });

  it('uses LLM_MODEL through the shared OpenRouter config', async () => {
    llmMocks.getOpenRouterConfig.mockReturnValue({
      openai: llmMocks.openai,
      model: 'test/llm-model',
      thinkingModel: null,
      timeoutMs: 120_000,
    });
    llmMocks.createOpenRouterChatCompletion.mockResolvedValueOnce({
      choices: [{ message: { content: '{"endSentenceIds":["s0001"]}' } }],
      model: 'test/llm-model',
    });
    const provider = createOpenRouterSceneAlignmentProvider();
    const request = {
      canonicalScenes: [{ sceneId: 'scene-01', text: 'First.' }],
      localizedSentences: 's0001\tLocalized.',
      languageCode: 'en' as const,
    };

    await expect(provider.align(request)).resolves.toEqual({
      endSentenceIds: ['s0001'],
    });
    expect(llmMocks.getOpenRouterConfig).toHaveBeenCalledWith({
      thinkingModel: null,
    });
    expect(llmMocks.createOpenRouterChatCompletion).toHaveBeenCalledWith(
      llmMocks.openai,
      expect.objectContaining({ model: 'test/llm-model' }),
      null,
      undefined,
    );
  });

  it('rejects malformed OpenRouter content and lets the caller degrade proportionally', async () => {
    llmMocks.getOpenRouterConfig.mockReturnValue({
      openai: llmMocks.openai,
      model: 'test/llm-model',
      thinkingModel: null,
      timeoutMs: 120_000,
    });
    llmMocks.createOpenRouterChatCompletion.mockResolvedValueOnce({
      choices: [],
      model: 'test/llm-model',
    });
    const provider = createOpenRouterSceneAlignmentProvider();

    await expect(
      provider.align({
        canonicalScenes: [{ sceneId: 'scene-01', text: 'First.' }],
        localizedSentences: 's0001\tLocalized.',
        languageCode: 'en',
      }),
    ).rejects.toThrow('invalid JSON content');
  });

  it('passes cancellation to the OpenRouter request', async () => {
    const controller = new AbortController();
    llmMocks.getOpenRouterConfig.mockReturnValue({
      openai: llmMocks.openai,
      model: 'test/alignment-model',
      thinkingModel: null,
      timeoutMs: 120_000,
    });
    llmMocks.createOpenRouterChatCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: '{"endSentenceIds":["s0001"]}',
          },
        },
      ],
      model: 'test/alignment-model',
    });

    await createOpenRouterSceneAlignmentProvider().align({
      canonicalScenes: [{ sceneId: 'scene-01', text: '第一句。' }],
      localizedSentences: '[s0001] First sentence.',
      languageCode: 'en',
      signal: controller.signal,
    });

    expect(llmMocks.createOpenRouterChatCompletion).toHaveBeenCalledWith(
      llmMocks.openai,
      expect.objectContaining({ model: 'test/alignment-model' }),
      null,
      { signal: controller.signal },
    );
  });

  it('does not call the alignment provider when already aborted', async () => {
    const controller = new AbortController();
    const abortReason = new Error('video lease lost');
    const provider = { align: vi.fn() };
    controller.abort(abortReason);

    await expect(
      alignLocalizedScenes(
        {
          canonicalScript: '第一句。第二句。第三句。',
          localizedScript: 'First. Second. Third.',
          languageCode: 'en',
          scenes,
        },
        { provider, signal: controller.signal },
      ),
    ).rejects.toBe(abortReason);
    expect(provider.align).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'reorders scenes',
      raw: {
        scenes: [
          {
            sceneId: 'scene-02',
            startSentenceId: 's0001',
            endSentenceId: 's0001',
          },
          {
            sceneId: 'scene-01',
            startSentenceId: 's0002',
            endSentenceId: 's0003',
          },
        ],
      },
    },
    {
      label: 'leaves a sentence gap',
      raw: {
        scenes: [
          {
            sceneId: 'scene-01',
            startSentenceId: 's0001',
            endSentenceId: 's0001',
          },
          {
            sceneId: 'scene-02',
            startSentenceId: 's0003',
            endSentenceId: 's0003',
          },
        ],
      },
    },
    {
      label: 'does not cover the final sentence',
      raw: {
        scenes: [
          {
            sceneId: 'scene-01',
            startSentenceId: 's0001',
            endSentenceId: 's0001',
          },
          {
            sceneId: 'scene-02',
            startSentenceId: 's0002',
            endSentenceId: 's0002',
          },
        ],
      },
    },
  ])('rejects alignment that $label', ({ raw }) => {
    expect(() =>
      validateSceneAlignment(scenes, ['s0001', 's0002', 's0003'], raw),
    ).toThrow(/Scene/);
  });
});
