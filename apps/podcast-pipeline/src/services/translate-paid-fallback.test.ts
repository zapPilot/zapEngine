import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createOpenRouterChatCompletion: vi.fn(),
  getOpenRouterConfig: vi.fn(),
}));

vi.mock('./llm.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./llm.js')>()),
  ...mocks,
}));

import { OpenRouterEmptyChoicesError } from './llm.js';
import { translateChineseText } from './translate.js';

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

it('keeps openrouter/free as the translation primary while the shared client owns model fallback', async () => {
  mocks.getOpenRouterConfig.mockImplementation(
    ({ model }: { model: string }) => ({
      openai: {},
      model,
      thinkingModel: null,
    }),
  );
  mocks.createOpenRouterChatCompletion.mockResolvedValueOnce({
    choices: [
      {
        message: { content: JSON.stringify({ text: 'Fallback translation' }) },
      },
    ],
    provider: 'OpenRouter',
    // The low-level shared fallback may return a different model than the
    // requested primary; translation must report that actual model and must not
    // maintain its own model list.
    model: 'deepseek/deepseek-v4-flash',
    usage: { cost: 0.0002 },
  });

  await expect(translateChineseText('測試', 'en')).resolves.toEqual({
    text: 'Fallback translation',
    cost: [
      expect.objectContaining({
        model: 'deepseek/deepseek-v4-flash',
        costUsd: 0.0002,
      }),
    ],
  });
  expect(mocks.getOpenRouterConfig).toHaveBeenCalledTimes(1);
  expect(mocks.getOpenRouterConfig).toHaveBeenCalledWith({
    model: 'openrouter/free',
    thinkingModel: null,
  });
  expect(mocks.createOpenRouterChatCompletion).toHaveBeenCalledTimes(1);
  expect(mocks.createOpenRouterChatCompletion.mock.calls[0]?.[1]).toMatchObject(
    {
      model: 'openrouter/free',
    },
  );
});

it('does not hide non-retryable authentication failures behind payload retries', async () => {
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

it('does not replay the shared chain after exhausted malformed models', async () => {
  mocks.getOpenRouterConfig.mockImplementation(
    ({ model }: { model: string }) => ({
      openai: {},
      model,
      thinkingModel: null,
    }),
  );
  const exhausted = new OpenRouterEmptyChoicesError(
    'OpenRouter returned no choices array for model fallback/one (provider=fixture)',
  );
  mocks.createOpenRouterChatCompletion.mockRejectedValueOnce(exhausted);

  await expect(translateChineseText('測試', 'ja')).rejects.toBe(exhausted);
  expect(mocks.createOpenRouterChatCompletion).toHaveBeenCalledTimes(1);
});
