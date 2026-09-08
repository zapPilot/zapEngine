import type OpenAI from 'openai';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ingestMocks = vi.hoisted(() => ({
  logIngestEvent: vi.fn(),
  logPipelineEvent: vi.fn(),
}));

vi.mock('./ingest/step.js', () => ingestMocks);

import { createOpenRouterChatCompletion } from './llm.js';

function completion(model: string) {
  return {
    id: 'completion-id',
    object: 'chat.completion',
    created: 0,
    model,
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        message: { role: 'assistant', content: '{"ok":true}', refusal: null },
        logprobs: null,
      },
    ],
    usage: {
      prompt_tokens: 1,
      completion_tokens: 1,
      total_tokens: 2,
      cost: 0.01,
    },
    provider: 'fixture-provider',
  };
}

function client(create: ReturnType<typeof vi.fn>): OpenAI {
  return {
    chat: { completions: { create } },
  } as unknown as OpenAI;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('shared OpenRouter model fallback', () => {
  it('advances from the task primary through LLM_FALLBACK_MODELS after a timeout', async () => {
    vi.stubEnv('LLM_FALLBACK_MODELS', 'fallback/one,fallback/two');
    const timeout = Object.assign(new Error('provider timed out'), {
      name: 'TimeoutError',
    });
    const create = vi
      .fn()
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce(completion('fallback/one'));

    const result = await createOpenRouterChatCompletion(
      client(create),
      {
        model: 'primary/model',
        messages: [{ role: 'user', content: 'hello' }],
      },
      null,
    );

    expect(result.model).toBe('fallback/one');
    expect(create.mock.calls.map(([request]) => request.model)).toEqual([
      'primary/model',
      'fallback/one',
    ]);
    expect(ingestMocks.logIngestEvent).toHaveBeenCalledWith(
      'llm:model-fallback',
      expect.objectContaining({
        model: 'primary/model',
        nextModel: 'fallback/one',
      }),
    );
  });

  it('deduplicates a primary that is also present in the shared fallback list', async () => {
    vi.stubEnv(
      'LLM_FALLBACK_MODELS',
      'fallback/one,primary/model,fallback/two',
    );
    const retryable = Object.assign(new Error('gateway unavailable'), {
      status: 503,
    });
    const create = vi
      .fn()
      .mockRejectedValueOnce(retryable)
      .mockRejectedValueOnce(retryable)
      .mockResolvedValueOnce(completion('fallback/two'));

    await createOpenRouterChatCompletion(
      client(create),
      {
        model: 'primary/model',
        messages: [{ role: 'user', content: 'hello' }],
      },
      null,
    );

    expect(create.mock.calls.map(([request]) => request.model)).toEqual([
      'primary/model',
      'fallback/one',
      'fallback/two',
    ]);
  });

  it('does not change models for non-retryable failures', async () => {
    vi.stubEnv('LLM_FALLBACK_MODELS', 'fallback/one');
    const badRequest = Object.assign(new Error('bad request'), { status: 400 });
    const create = vi.fn().mockRejectedValueOnce(badRequest);

    await expect(
      createOpenRouterChatCompletion(
        client(create),
        {
          model: 'primary/model',
          messages: [{ role: 'user', content: 'hello' }],
        },
        null,
      ),
    ).rejects.toBe(badRequest);

    expect(create).toHaveBeenCalledTimes(1);
  });
});
