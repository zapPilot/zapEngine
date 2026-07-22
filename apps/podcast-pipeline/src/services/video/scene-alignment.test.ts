import { describe, expect, it, vi } from 'vitest';

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
  createNvidiaSceneAlignmentProvider,
  createOpenRouterSceneAlignmentProvider,
  proportionalSceneAlignment,
  validateSceneAlignment,
  type VisualSceneAnchor,
} from './scene-alignment.js';

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
  it('uses canonical sentence ranges without a provider call', () => {
    expect(canonicalSceneAlignment(scenes, '第一句。第二句。第三句。')).toEqual(
      scenes,
    );
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
    { endSentenceIds: ['s0002'] },
    { endSentenceIds: ['s0003', 's0002'] },
    { endSentenceIds: ['s0001', 's0003'] },
  ])('rejects invalid compact alignment %#', (raw) => {
    expect(() =>
      validateSceneAlignment(scenes, ['s0001', 's0002', 's0003', 's0004'], raw),
    ).toThrow(/Scene/);
  });

  it('routes NVIDIA alignment through the NVIDIA-compatible client', async () => {
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: 'We{"endSentenceIds":["s0001"]}',
          },
        },
      ],
    });
    const controller = new AbortController();
    const provider = createNvidiaSceneAlignmentProvider({
      model: 'deepseek-ai/deepseek-v4-flash',
      client: {
        chat: { completions: { create } },
      } as never,
    });

    await expect(
      provider.align({
        canonicalScenes: [{ sceneId: 'scene-01', text: '第一句。' }],
        localizedSentences: '[s0001] First sentence.',
        languageCode: 'en',
        signal: controller.signal,
      }),
    ).resolves.toEqual({ endSentenceIds: ['s0001'] });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'deepseek-ai/deepseek-v4-flash',
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringMatching(/^\/no_think/),
          }),
        ]),
        response_format: { type: 'json_object' },
      }),
      { signal: controller.signal },
    );
  });

  it('selects the configured NVIDIA provider', () => {
    const previousProvider = process.env['VIDEO_ALIGNMENT_PROVIDER'];
    const previousKey = process.env['NVIDIA_API_KEY'];
    process.env['VIDEO_ALIGNMENT_PROVIDER'] = 'nvidia';
    process.env['NVIDIA_API_KEY'] = 'test-key';
    try {
      expect(configuredSceneAlignmentProvider()).toEqual(
        expect.objectContaining({ align: expect.any(Function) }),
      );
    } finally {
      if (previousProvider === undefined) {
        delete process.env['VIDEO_ALIGNMENT_PROVIDER'];
      } else {
        process.env['VIDEO_ALIGNMENT_PROVIDER'] = previousProvider;
      }
      if (previousKey === undefined) {
        delete process.env['NVIDIA_API_KEY'];
      } else {
        process.env['NVIDIA_API_KEY'] = previousKey;
      }
    }
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
