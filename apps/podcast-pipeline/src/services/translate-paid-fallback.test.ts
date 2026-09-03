import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createOpenRouterChatCompletion: vi.fn(),
  getOpenRouterConfig: vi.fn(),
}));

vi.mock('./llm.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./llm.js')>()),
  ...mocks,
}));

import { translateChineseText } from './translate.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.clearAllMocks();
});

it('falls back from the free router to the configured paid model after retry exhaustion', async () => {
  vi.useFakeTimers();
  vi.stubEnv(
    'TRANSLATION_FALLBACK_MODELS',
    'deepseek/deepseek-v4-flash-0731,z-ai/glm-5.3-flash',
  );
  mocks.getOpenRouterConfig.mockImplementation(
    ({ model }: { model: string }) => ({
      openai: {},
      model,
      thinkingModel: null,
    }),
  );
  mocks.createOpenRouterChatCompletion
    .mockRejectedValueOnce({ status: 503 })
    .mockRejectedValueOnce({ status: 503 })
    .mockResolvedValueOnce({
      choices: [
        { message: { content: JSON.stringify({ text: 'Paid translation' }) } },
      ],
      provider: 'OpenRouter',
      model: 'deepseek/deepseek-v4-flash-0731',
      usage: { cost: 0.0002 },
    });

  const promise = translateChineseText('測試', 'en');
  await vi.advanceTimersByTimeAsync(500);

  await expect(promise).resolves.toEqual({
    text: 'Paid translation',
    cost: [
      expect.objectContaining({
        model: 'deepseek/deepseek-v4-flash-0731',
        costUsd: 0.0002,
      }),
    ],
  });
  expect(
    mocks.getOpenRouterConfig.mock.calls.map(([options]) => options.model),
  ).toEqual([
    'openrouter/free',
    'openrouter/free',
    'deepseek/deepseek-v4-flash-0731',
  ]);
});

it('does not hide non-retryable authentication failures behind model fallback', async () => {
  vi.stubEnv('TRANSLATION_FALLBACK_MODELS', 'paid/model');
  mocks.getOpenRouterConfig.mockImplementation(
    ({ model }: { model: string }) => ({
      openai: {},
      model,
      thinkingModel: null,
    }),
  );
  mocks.createOpenRouterChatCompletion.mockRejectedValueOnce({ status: 401 });

  await expect(translateChineseText('測試', 'ja')).rejects.toEqual({
    status: 401,
  });
  expect(mocks.getOpenRouterConfig).toHaveBeenCalledTimes(1);
  expect(mocks.getOpenRouterConfig).toHaveBeenCalledWith({
    model: 'openrouter/free',
    thinkingModel: null,
  });
});
