import type OpenAI from 'openai';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ingestMocks = vi.hoisted(() => ({
  logIngestEvent: vi.fn(),
  logPipelineEvent: vi.fn(),
}));

vi.mock('./ingest/step.js', () => ingestMocks);

import { createOpenRouterChatCompletion } from './llm.js';

function client(create: ReturnType<typeof vi.fn>): OpenAI {
  return {
    chat: { completions: { create } },
  } as unknown as OpenAI;
}

function malformedChoicesCompletion(model: string) {
  return {
    id: 'completion-id',
    object: 'chat.completion',
    created: 0,
    model,
    choices: undefined,
    usage: {
      prompt_tokens: 1,
      completion_tokens: 0,
      total_tokens: 1,
      cost: 0,
    },
    provider: 'fixture-provider',
  };
}

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

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('shared OpenRouter fallback chain', () => {
  it('continues past a malformed intermediate fallback model', async () => {
    vi.stubEnv('LLM_FALLBACK_MODELS', 'fallback/one,fallback/two');
    const create = vi
      .fn()
      .mockResolvedValueOnce(malformedChoicesCompletion('primary/model'))
      .mockResolvedValueOnce(malformedChoicesCompletion('fallback/one'))
      .mockResolvedValueOnce(completion('fallback/two'));

    const result = await createOpenRouterChatCompletion(
      client(create),
      {
        model: 'primary/model',
        messages: [{ role: 'user', content: 'hello' }],
      },
      null,
    );

    expect(result.model).toBe('fallback/two');
    expect(create.mock.calls.map(([request]) => request.model)).toEqual([
      'primary/model',
      'fallback/one',
      'fallback/two',
    ]);
    expect(ingestMocks.logIngestEvent).toHaveBeenNthCalledWith(
      1,
      'llm:model-fallback',
      expect.objectContaining({
        model: 'primary/model',
        nextModel: 'fallback/one',
      }),
    );
    expect(ingestMocks.logIngestEvent).toHaveBeenNthCalledWith(
      2,
      'llm:model-fallback',
      expect.objectContaining({
        model: 'fallback/one',
        nextModel: 'fallback/two',
      }),
    );
  });
});
