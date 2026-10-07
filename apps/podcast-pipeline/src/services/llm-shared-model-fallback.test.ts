import { APIError, type OpenAI } from 'openai';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ingestMocks = vi.hoisted(() => ({
  logIngestEvent: vi.fn(),
  logPipelineEvent: vi.fn(),
}));

vi.mock('./ingest/step.js', () => ingestMocks);

import {
  createOpenRouterChatCompletion,
  OpenRouterEmptyChoicesError,
  OpenRouterEmptyContentError,
} from './llm.js';

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

function emptyContentCompletion(model: string, finishReason = 'length') {
  return {
    id: 'completion-id',
    object: 'chat.completion',
    created: 0,
    model,
    choices: [
      {
        index: 0,
        finish_reason: finishReason,
        message: { role: 'assistant', content: '', refusal: null },
        logprobs: null,
      },
    ],
    usage: {
      prompt_tokens: 1,
      completion_tokens: 0,
      total_tokens: 1,
      cost: 0.087,
    },
    provider: 'fixture-provider',
  };
}

function emptyChoicesCompletion(model: string) {
  return {
    id: 'completion-id',
    object: 'chat.completion',
    created: 0,
    model,
    choices: [],
    usage: {
      prompt_tokens: 1,
      completion_tokens: 0,
      total_tokens: 1,
      cost: 0,
    },
    provider: 'fixture-provider',
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('shared OpenRouter model fallback', () => {
  it('reaches the final script candidate after the mandatory-reasoning 400', async () => {
    vi.stubEnv(
      'LLM_FALLBACK_MODELS',
      'minimax/minimax-m3,z-ai/glm-5.3-flash,deepseek/deepseek-v4-flash',
    );
    const gatewayError = APIError.generate(
      503,
      undefined,
      'unavailable',
      new Headers(),
    );
    const capabilityError = APIError.generate(
      400,
      {
        error: {
          message:
            'Reasoning is mandatory for this endpoint and cannot be disabled.',
          code: 400,
        },
      },
      undefined,
      new Headers(),
    );
    const create = vi
      .fn()
      .mockRejectedValueOnce(gatewayError)
      .mockRejectedValueOnce(gatewayError)
      .mockRejectedValueOnce(capabilityError)
      .mockResolvedValueOnce(completion('deepseek/deepseek-v4-flash'));

    const result = await createOpenRouterChatCompletion(
      client(create),
      {
        model: 'deepseek/deepseek-v4-flash-0731',
        messages: [{ role: 'user', content: 'Write narration' }],
      },
      null,
      { reasoning: { enabled: false } },
    );

    expect(result.model).toBe('deepseek/deepseek-v4-flash');
    expect(create.mock.calls.map(([request]) => request.model)).toEqual([
      'deepseek/deepseek-v4-flash-0731',
      'minimax/minimax-m3',
      'z-ai/glm-5.3-flash',
      'deepseek/deepseek-v4-flash',
    ]);
    for (const [request] of create.mock.calls) {
      expect(request.reasoning).toEqual({ enabled: false });
    }
  });

  it.each([
    [400, 'Invalid request configuration', { enabled: false }, 'paid/model'],
    [
      401,
      'Reasoning is mandatory for this endpoint and cannot be disabled.',
      { enabled: false },
      'paid/model',
    ],
    [403, 'Forbidden', { enabled: false }, 'paid/model'],
    [404, 'Unknown model', { enabled: false }, 'paid/model'],
    [
      400,
      'Reasoning is mandatory for this endpoint and cannot be disabled.',
      undefined,
      'paid/model',
    ],
    [
      400,
      'Reasoning is mandatory for this endpoint and cannot be disabled.',
      { enabled: true },
      'paid/model',
    ],
    [
      400,
      'Reasoning is mandatory for this endpoint and cannot be disabled.',
      { enabled: false },
      'openrouter/free',
    ],
  ])(
    'keeps unmatched capability/auth/config failures terminal (%s, %s, %j, %s)',
    async (status, message, reasoning, model) => {
      vi.stubEnv('LLM_FALLBACK_MODELS', 'paid/fallback');
      const error = APIError.generate(
        status,
        { error: { message, code: status } },
        undefined,
        new Headers(),
      );
      const create = vi.fn().mockRejectedValueOnce(error);
      await expect(
        createOpenRouterChatCompletion(
          client(create),
          { model, messages: [{ role: 'user', content: 'hello' }] },
          null,
          { reasoning },
        ),
      ).rejects.toBe(error);
      expect(create).toHaveBeenCalledTimes(1);
    },
  );

  it('throws the final capability rejection without retrying it', async () => {
    vi.stubEnv('LLM_FALLBACK_MODELS', '');
    const error = APIError.generate(
      400,
      {
        error: {
          message:
            'Reasoning is mandatory for this endpoint and cannot be disabled.',
          code: 400,
        },
      },
      undefined,
      new Headers(),
    );
    const create = vi.fn().mockRejectedValueOnce(error);
    await expect(
      createOpenRouterChatCompletion(
        client(create),
        {
          model: 'z-ai/glm-5.3-flash',
          messages: [{ role: 'user', content: 'hello' }],
        },
        null,
        { reasoning: { enabled: false } },
      ),
    ).rejects.toBe(error);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('omits reasoning for the free primary and preserves it for a paid fallback', async () => {
    vi.stubEnv('LLM_FALLBACK_MODELS', 'paid/fallback');
    const timeout = Object.assign(new Error('provider timed out'), {
      name: 'TimeoutError',
    });
    const create = vi
      .fn()
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce(completion('paid/fallback'));
    await createOpenRouterChatCompletion(
      client(create),
      {
        model: 'openrouter/free',
        messages: [{ role: 'user', content: 'Return JSON' }],
        response_format: { type: 'json_object' },
      },
      null,
      { reasoning: { enabled: false } },
    );
    const requests = create.mock.calls.map(([request]) => request);
    expect(requests[0]).toMatchObject({
      model: 'openrouter/free',
      response_format: { type: 'json_object' },
      provider: { require_parameters: true },
    });
    expect(requests[0]).not.toHaveProperty('reasoning');
    expect(requests[1]).toMatchObject({
      model: 'paid/fallback',
      reasoning: { enabled: false },
    });
    expect(ingestMocks.logIngestEvent).toHaveBeenCalledWith(
      'llm:request',
      expect.objectContaining({
        model: 'openrouter/free',
        reasoning: 'provider-default',
      }),
    );
    expect(ingestMocks.logIngestEvent).toHaveBeenCalledWith(
      'llm:request',
      expect.objectContaining({
        model: 'paid/fallback',
        reasoning: 'disabled',
      }),
    );
  });

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

  it('malformed primary choices reaches the next configured model', async () => {
    vi.stubEnv('LLM_FALLBACK_MODELS', 'fallback/one,fallback/two');
    const create = vi
      .fn()
      .mockResolvedValueOnce(malformedChoicesCompletion('primary/model'))
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
        error: expect.stringContaining('no choices array'),
      }),
    );
  });

  // A well-formed envelope with no candidate in it used to be kept as a
  // "successful" response. Every caller then read `choices[0]` as nothing and
  // failed on its own terms, so the chain never got a chance to route around
  // the endpoint that produced it.
  it('an empty choices array reaches the next configured model', async () => {
    vi.stubEnv('LLM_FALLBACK_MODELS', 'fallback/one');
    const create = vi
      .fn()
      .mockResolvedValueOnce(emptyChoicesCompletion('primary/model'))
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
  });

  it('blank content reaches the next configured model', async () => {
    vi.stubEnv('LLM_FALLBACK_MODELS', 'fallback/one');
    const create = vi
      .fn()
      .mockResolvedValueOnce(emptyContentCompletion('primary/model'))
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
        error: expect.stringContaining('finishReason=length'),
      }),
    );
  });

  it('exhausted blank-content models fail without replay', async () => {
    vi.stubEnv('LLM_FALLBACK_MODELS', 'fallback/one');
    const create = vi
      .fn()
      .mockResolvedValueOnce(emptyContentCompletion('primary/model'))
      .mockResolvedValueOnce(emptyContentCompletion('fallback/one'));

    await expect(
      createOpenRouterChatCompletion(
        client(create),
        {
          model: 'primary/model',
          messages: [{ role: 'user', content: 'hello' }],
        },
        null,
      ),
    ).rejects.toBeInstanceOf(OpenRouterEmptyContentError);

    expect(create.mock.calls.map(([request]) => request.model)).toEqual([
      'primary/model',
      'fallback/one',
    ]);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('exhausted malformed models fail without replay', async () => {
    vi.stubEnv('LLM_FALLBACK_MODELS', 'fallback/one');
    const create = vi
      .fn()
      .mockResolvedValueOnce(malformedChoicesCompletion('primary/model'))
      .mockResolvedValueOnce(malformedChoicesCompletion('fallback/one'));

    await expect(
      createOpenRouterChatCompletion(
        client(create),
        {
          model: 'primary/model',
          messages: [{ role: 'user', content: 'hello' }],
        },
        null,
      ),
    ).rejects.toBeInstanceOf(OpenRouterEmptyChoicesError);

    expect(create.mock.calls.map(([request]) => request.model)).toEqual([
      'primary/model',
      'fallback/one',
    ]);
    expect(create).toHaveBeenCalledTimes(2);
  });
});
