import OpenAI from 'openai';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';

const ingestMocks = vi.hoisted(() => ({
  logIngestEvent: vi.fn(),
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    readFileSync: vi.fn(() => 'Podcast script system prompt'),
  };
});

vi.mock('openai', () => ({
  default: vi.fn(),
}));

vi.mock('./ingest/step.js', () => ingestMocks);

import { generateScriptWithLLM } from './llm.js';

function mockOpenAIClient(createMock: Mock): void {
  vi.mocked(OpenAI).mockImplementation(function () {
    return {
      chat: {
        completions: {
          create: createMock,
        },
      },
    } as unknown as OpenAI;
  });
}

function successfulCompletion(): unknown {
  return {
    choices: [{ message: { content: 'Generated script' } }],
    provider: 'test-provider',
    model: 'test/model',
    usage: { cost: 0.01 },
  };
}

function timeoutUntilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener(
      'abort',
      () => reject(new DOMException('This operation was aborted', 'AbortError')),
      { once: true },
    );
  });
}

describe('generateScriptWithLLM retries', () => {
  beforeEach(() => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-api-key');
    vi.stubEnv('OPENROUTER_BASE_URL', 'https://test.openrouter.ai/api/v1');
    vi.stubEnv('OPENROUTER_TIMEOUT_MS', '25');
    vi.stubEnv('LLM_MODEL', 'test/model');
    vi.stubEnv('LLM_THINKING_MODEL', '');
    vi.mocked(OpenAI).mockReset();
    ingestMocks.logIngestEvent.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('retries a timed-out request with a fresh deadline and succeeds', async () => {
    vi.useFakeTimers();
    const requestSignals: AbortSignal[] = [];
    const mockCreate = vi.fn(
      (
        _request: unknown,
        options?: { signal?: AbortSignal },
      ): Promise<unknown> => {
        const signal = options?.signal;
        if (!signal) {
          throw new Error('Expected an OpenRouter request signal');
        }
        requestSignals.push(signal);
        return requestSignals.length === 1
          ? timeoutUntilAborted(signal)
          : Promise.resolve(successfulCompletion());
      },
    );
    mockOpenAIClient(mockCreate);

    const resultPromise = generateScriptWithLLM('Title', 'Article');
    const resultAssertion = expect(resultPromise).resolves.toEqual({
      script: 'Generated script',
      model: 'test/model',
      thinkingModel: null,
      provider: 'test-provider',
      costUsd: 0.01,
    });

    await vi.runAllTimersAsync();
    await resultAssertion;

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(requestSignals).toHaveLength(2);
    expect(requestSignals[0]).not.toBe(requestSignals[1]);
    expect(requestSignals[0]?.aborted).toBe(true);
    expect(requestSignals[1]?.aborted).toBe(false);
    expect(ingestMocks.logIngestEvent).toHaveBeenCalledWith(
      'llm:retry',
      expect.objectContaining({
        operation: 'generateScript',
        attempt: 1,
        nextAttempt: 2,
        error: 'OpenRouter request timed out after 25ms',
      }),
    );
  });

  it('retries a retryable provider error once', async () => {
    vi.useFakeTimers();
    const providerError = Object.assign(new Error('provider unavailable'), {
      status: 503,
    });
    const mockCreate = vi
      .fn()
      .mockRejectedValueOnce(providerError)
      .mockResolvedValueOnce(successfulCompletion());
    mockOpenAIClient(mockCreate);

    const resultPromise = generateScriptWithLLM('Title', 'Article');
    const resultAssertion = expect(resultPromise).resolves.toMatchObject({
      script: 'Generated script',
    });

    await vi.runAllTimersAsync();
    await resultAssertion;

    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-retryable provider error', async () => {
    const providerError = Object.assign(new Error('invalid request'), {
      status: 400,
    });
    const mockCreate = vi.fn().mockRejectedValue(providerError);
    mockOpenAIClient(mockCreate);

    await expect(generateScriptWithLLM('Title', 'Article')).rejects.toBe(
      providerError,
    );

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(ingestMocks.logIngestEvent).not.toHaveBeenCalledWith(
      'llm:retry',
      expect.anything(),
    );
  });
});
