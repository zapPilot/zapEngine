import OpenAI from 'openai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildNvidiaStoryboardSystemPrompt,
  buildNvidiaStoryboardUserPrompt,
  createNvidiaStoryboardProvider,
} from './nvidia.js';
import type { StoryboardProviderRequest } from './provider.js';

const request: StoryboardProviderRequest = {
  title: 'Fed liquidity',
  script: 'The Fed met. Markets moved.',
  durationMs: 12_000,
  sentences: [
    {
      id: 's0001',
      index: 0,
      text: 'The Fed met.',
      startOffset: 0,
      endOffset: 12,
    },
    {
      id: 's0002',
      index: 1,
      text: 'Markets moved.',
      startOffset: 13,
      endOffset: 27,
    },
  ],
};

const originalApiKey = process.env['NVIDIA_API_KEY'];
const originalModel = process.env['NVIDIA_STORYBOARD_MODEL'];
const originalBaseUrl = process.env['NVIDIA_BASE_URL'];

afterEach(() => {
  if (originalApiKey === undefined) delete process.env['NVIDIA_API_KEY'];
  else process.env['NVIDIA_API_KEY'] = originalApiKey;
  if (originalModel === undefined) delete process.env['NVIDIA_STORYBOARD_MODEL'];
  else process.env['NVIDIA_STORYBOARD_MODEL'] = originalModel;
  if (originalBaseUrl === undefined) delete process.env['NVIDIA_BASE_URL'];
  else process.env['NVIDIA_BASE_URL'] = originalBaseUrl;
  vi.restoreAllMocks();
});

function clientReturning(input: {
  content?: string | null;
  model?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
}) {
  const create = vi.fn().mockResolvedValue({
    choices: input.content === undefined ? [] : [{ message: { content: input.content } }],
    model: input.model ?? '',
    usage: input.usage ?? null,
  });
  return {
    client: { chat: { completions: { create } } } as unknown as OpenAI,
    create,
  };
}

describe('NVIDIA storyboard prompts', () => {
  it('builds the strict system contract and a normal user prompt', () => {
    expect(buildNvidiaStoryboardSystemPrompt()).toContain('/no_think');
    const prompt = buildNvidiaStoryboardUserPrompt(request);
    expect(prompt).toContain('Fed liquidity');
    expect(prompt).toContain('s0001\tThe Fed met.');
    expect(prompt).not.toContain('上一次輸出未通過驗證');
  });

  it('includes repair issues with both nested and root paths', () => {
    const prompt = buildNvidiaStoryboardUserPrompt(request, {
      repairIssues: [
        { code: 'scenes.sceneId.missing', path: ['scenes', 0, 'sceneId'], message: 'wrong id' },
        { code: 'root.invalid', path: [], message: 'invalid root' },
      ],
    });
    expect(prompt).toContain('scenes.0.sceneId: wrong id');
    expect(prompt).toContain('<root>: invalid root');
  });
});

describe('NVIDIA storyboard provider', () => {
  it('parses fenced JSON, forwards an abort signal, and returns usage', async () => {
    const { client, create } = clientReturning({
      content: '```json\n{"scenes":[]}\n```',
      model: 'served-model',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
    const provider = createNvidiaStoryboardProvider({
      client,
      model: 'requested-model',
    });
    const controller = new AbortController();

    await expect(
      provider.generate(request, { signal: controller.signal }),
    ).resolves.toEqual({
      draft: { scenes: [] },
      model: 'served-model',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'requested-model' }),
      { signal: controller.signal },
    );
  });

  it('parses unfenced and generic fenced JSON and falls back to the requested model', async () => {
    for (const content of ['{"scenes":[]}', '```\n{"scenes":[]}\n```']) {
      const { client, create } = clientReturning({ content, model: '' });
      const provider = createNvidiaStoryboardProvider({
        client,
        model: 'fallback-model',
      });
      await expect(provider.generate(request)).resolves.toEqual({
        draft: { scenes: [] },
        model: 'fallback-model',
        usage: null,
      });
      expect(create.mock.calls[0]?.[1]).toBeUndefined();
    }
  });

  it('rejects empty and malformed provider JSON including incomplete fences', async () => {
    for (const content of ['', '{bad', '```']) {
      const { client } = clientReturning({ content });
      const provider = createNvidiaStoryboardProvider({ client });
      await expect(provider.generate(request)).rejects.toThrow(/NVIDIA returned/);
    }

    const { client } = clientReturning({ content: undefined });
    await expect(
      createNvidiaStoryboardProvider({ client }).generate(request),
    ).rejects.toThrow('empty storyboard JSON');
  });

  it('uses environment and default model fallbacks with injected clients', () => {
    const { client } = clientReturning({ content: '{"scenes":[]}' });
    process.env['NVIDIA_STORYBOARD_MODEL'] = ' env-model ';
    expect(createNvidiaStoryboardProvider({ client }).model).toBe('env-model');

    delete process.env['NVIDIA_STORYBOARD_MODEL'];
    expect(createNvidiaStoryboardProvider({ client }).model).toBe(
      'nvidia/nvidia-nemotron-nano-9b-v2',
    );
  });

  it('requires an API key when a real client must be created', () => {
    delete process.env['NVIDIA_API_KEY'];
    expect(() => createNvidiaStoryboardProvider()).toThrow(
      'NVIDIA_API_KEY not set',
    );

    expect(() =>
      createNvidiaStoryboardProvider({
        apiKey: 'test-key',
        baseURL: 'https://nvidia.example/v1',
        model: 'model',
      }),
    ).not.toThrow();
  });
});
