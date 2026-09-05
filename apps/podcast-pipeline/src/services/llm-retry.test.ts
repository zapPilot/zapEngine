import OpenAI, { APIConnectionError, APIConnectionTimeoutError } from 'openai';
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

const openAiMocks = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    readFileSync: vi.fn(() => 'Podcast script system prompt'),
  };
});

// Only the client is faked. The real error classes stay exported so error
// classification keeps seeing genuine SDK instances -- it matches them by type,
// and a stub would make every `instanceof` check silently false.
vi.mock('openai', async () => ({
  ...(await vi.importActual<typeof import('openai')>('openai')),
  default: vi.fn().mockImplementation(function () {
    return {
      chat: {
        completions: {
          create: openAiMocks.create,
        },
      },
    };
  }),
}));

vi.mock('./ingest/step.js', () => ingestMocks);

import {
  createCompletionWithRetry,
  generateLanguageClassroomsWithLLM,
  generateScriptWithLLM,
  getOpenRouterConfig,
  type LlmAttemptRecord,
} from './llm.js';

/**
 * Script generation runs on its own deadline, deliberately unreachable through
 * `OPENROUTER_TIMEOUT_MS`; the literal is the contract these tests assert.
 */
const SCRIPT_TIMEOUT_MS = 600_000;

function providerErrorWithStatus(status: number): Error {
  return Object.assign(new Error(`provider responded ${status}`), { status });
}

/**
 * A DNS/TLS/socket failure exactly as the SDK throws it. Constructed, never
 * hand-shaped: an `{ name: 'APIConnectionError' }` literal would pass a test
 * that no real request can, because every SDK error class inherits the plain
 * 'Error' name.
 */
function sdkConnectionError(): Error {
  return new APIConnectionError({ message: 'Connection error.' });
}

function requestProviderRouting(
  mockCreate: Mock,
  callIndex: number,
): Record<string, unknown> | undefined {
  const request = mockCreate.mock.calls[callIndex]?.[0] as
    | { provider?: Record<string, unknown> }
    | undefined;
  return request?.provider;
}

function mockOpenAIClient(createMock: Mock): void {
  openAiMocks.create.mockImplementation((...args: unknown[]) =>
    createMock(...args),
  );
}

function successfulCompletion(): unknown {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({
            title: '市場流動性正在重新定價',
            script: 'Generated script',
          }),
        },
      },
    ],
    provider: 'test-provider',
    model: 'test/model',
    usage: { cost: 0.01 },
  };
}

function validClassroomContent(): string {
  return JSON.stringify({
    lessons: [
      {
        targetLanguageCode: 'ja',
        oneLiner: '市場流動性が再び焦点に',
        keywords: [{ term: '流動性', meaning: '資金進出的難易度' }],
        script: '流動性とは、資産を素早く現金化できる度合いのことです。',
      },
      {
        targetLanguageCode: 'en',
        oneLiner: 'Market liquidity is back in focus',
        keywords: [{ term: 'liquidity', meaning: '資金進出的難易度' }],
        script: 'Liquidity is how easily an asset can be converted to cash.',
      },
    ],
  });
}

function classroomCompletion(
  content: string,
  finishReason: string | null = null,
): unknown {
  return {
    choices: [
      {
        message: { content },
        ...(finishReason === null ? {} : { finish_reason: finishReason }),
      },
    ],
    provider: 'test-provider',
    model: 'test/model',
    usage: { cost: 0.02 },
  };
}

function successfulClassroomCompletion(): unknown {
  return classroomCompletion(validClassroomContent());
}

/** A body a provider really returns: valid until an unescaped quote inside a
 * narration script. `padding` grows it past the length at which V8 reports the
 * offending character as a position rather than inlining the whole document. */
function malformedClassroomContent(padding: number): string {
  return `{"lessons":[{"script":"${'流動性の話。'.repeat(padding)}"引號"}]}`;
}

function classroomLessonsContent(
  lessons: { target: string; script: string }[],
): string {
  return JSON.stringify({
    lessons: lessons.map(({ target, script }) => ({
      targetLanguageCode: target,
      oneLiner: `oneLiner ${target}`,
      keywords: [{ term: `term-${target}`, meaning: '資金進出的難易度' }],
      script,
    })),
  });
}

function requestUserMessage(mockCreate: Mock, callIndex: number): string {
  const request = mockCreate.mock.calls[callIndex]?.[0] as
    | { messages?: { role: string; content: string }[] }
    | undefined;
  return (
    request?.messages?.find((message) => message.role === 'user')?.content ?? ''
  );
}

function timeoutUntilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener(
      'abort',
      () =>
        reject(new DOMException('This operation was aborted', 'AbortError')),
      { once: true },
    );
  });
}

const classroomInput = {
  title: '市場流動性與升息',
  articleText: '這篇文章解釋量化緊縮如何抽走市場流動性。',
  script: '大家好，今天談量化緊縮、流動性與升息。',
  sourceLanguageCode: 'zh-Hant',
  targetLanguageCodes: ['ja', 'en'] as ('ja' | 'en')[],
};

beforeEach(() => {
  vi.stubEnv('OPENROUTER_API_KEY', 'test-api-key');
  vi.stubEnv('OPENROUTER_BASE_URL', 'https://test.openrouter.ai/api/v1');
  vi.stubEnv('OPENROUTER_TIMEOUT_MS', '25');
  vi.stubEnv('LLM_MODEL', 'test/model');
  vi.stubEnv('LLM_THINKING_MODEL', '');
  vi.mocked(OpenAI).mockClear();
  openAiMocks.create.mockReset();
  ingestMocks.logIngestEvent.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('generateScriptWithLLM request policy', () => {
  it('completes a generation that outlives the shared request ceiling', async () => {
    vi.useFakeTimers();
    const requestTimeouts: number[] = [];
    const mockCreate = vi.fn(
      (_request: unknown, options?: { timeout?: number }): Promise<unknown> => {
        requestTimeouts.push(options?.timeout ?? -1);
        return new Promise((resolve) =>
          setTimeout(() => resolve(successfulCompletion()), 300_000),
        );
      },
    );
    mockOpenAIClient(mockCreate);

    const resultPromise = generateScriptWithLLM('Title', 'Article');
    const resultAssertion = expect(resultPromise).resolves.toMatchObject({
      script: 'Generated script',
    });
    await vi.runAllTimersAsync();
    await resultAssertion;

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(requestTimeouts).toEqual([SCRIPT_TIMEOUT_MS]);
  });

  it('returns a successful response from one request', async () => {
    const requestTimeouts: number[] = [];
    const mockCreate = vi.fn(
      (_request: unknown, options?: { timeout?: number }): Promise<unknown> => {
        requestTimeouts.push(options?.timeout ?? -1);
        return Promise.resolve(successfulCompletion());
      },
    );
    mockOpenAIClient(mockCreate);

    await expect(generateScriptWithLLM('Title', 'Article')).resolves.toEqual({
      title: '市場流動性正在重新定價',
      script: 'Generated script',
      model: 'test/model',
      thinkingModel: null,
      provider: 'test-provider',
      costUsd: 0.01,
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(requestTimeouts).toEqual([SCRIPT_TIMEOUT_MS]);
  });

  it('aborts at the script deadline and never replays the timeout', async () => {
    vi.useFakeTimers();
    const requestSignals: AbortSignal[] = [];
    const mockCreate = vi.fn(
      (
        _request: unknown,
        options?: { signal?: AbortSignal },
      ): Promise<unknown> => {
        const signal = options?.signal;
        if (!signal) throw new Error('Expected an OpenRouter request signal');
        requestSignals.push(signal);
        return timeoutUntilAborted(signal);
      },
    );
    mockOpenAIClient(mockCreate);

    const resultPromise = generateScriptWithLLM('Title', 'Article');
    const rejection = expect(resultPromise).rejects.toThrow(
      'OpenRouter request timed out after 600000ms',
    );
    await vi.advanceTimersByTimeAsync(SCRIPT_TIMEOUT_MS);
    await rejection;

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(requestSignals[0]?.aborted).toBe(true);
    for (const event of ['llm:retry', 'llm:fallback']) {
      expect(ingestMocks.logIngestEvent).not.toHaveBeenCalledWith(
        event,
        expect.anything(),
      );
    }
  });

  it('re-routes a gateway failure exactly once', async () => {
    const mockCreate = vi
      .fn()
      .mockRejectedValueOnce(providerErrorWithStatus(502))
      .mockResolvedValueOnce(successfulCompletion());
    mockOpenAIClient(mockCreate);

    await expect(
      generateScriptWithLLM('Title', 'Article'),
    ).resolves.toMatchObject({ script: 'Generated script' });

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(requestProviderRouting(mockCreate, 0)).toEqual({
      sort: 'throughput',
      require_parameters: true,
    });
    // No `sort` is the whole mechanism: it hands endpoint choice back to
    // OpenRouter instead of re-sending to the endpoint that just failed.
    expect(requestProviderRouting(mockCreate, 1)).toEqual({
      require_parameters: true,
    });
    expect(ingestMocks.logIngestEvent).toHaveBeenCalledWith(
      'llm:fallback',
      expect.objectContaining({
        operation: 'generateScript',
        routing: 'default',
      }),
    );
  });

  it('fails after the re-routed request also fails', async () => {
    const secondError = providerErrorWithStatus(503);
    const mockCreate = vi
      .fn()
      .mockRejectedValueOnce(providerErrorWithStatus(502))
      .mockRejectedValueOnce(secondError);
    mockOpenAIClient(mockCreate);

    await expect(generateScriptWithLLM('Title', 'Article')).rejects.toBe(
      secondError,
    );
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('re-routes an SDK connection failure exactly once', async () => {
    const mockCreate = vi
      .fn()
      .mockRejectedValueOnce(sdkConnectionError())
      .mockResolvedValueOnce(successfulCompletion());
    mockOpenAIClient(mockCreate);

    await expect(
      generateScriptWithLLM('Title', 'Article'),
    ).resolves.toMatchObject({ script: 'Generated script' });

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(requestProviderRouting(mockCreate, 1)).toEqual({
      require_parameters: true,
    });
    expect(ingestMocks.logIngestEvent).toHaveBeenCalledWith(
      'llm:fallback',
      expect.objectContaining({ operation: 'generateScript' }),
    );
  });

  it('does not re-route an SDK request timeout', async () => {
    const requestTimeout = new APIConnectionTimeoutError({
      message: 'Request timed out.',
    });
    const attempts: LlmAttemptRecord[] = [];
    const mockCreate = vi.fn().mockRejectedValue(requestTimeout);
    mockOpenAIClient(mockCreate);

    await expect(
      generateScriptWithLLM('Title', 'Article', {
        onAttempt: (record) => attempts.push(record),
      }),
    ).rejects.toBe(requestTimeout);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(attempts).toMatchObject([
      { attempt: 1, status: 'failed', errorCategory: 'timeout' },
    ]);
    expect(ingestMocks.logIngestEvent).not.toHaveBeenCalledWith(
      'llm:fallback',
      expect.anything(),
    );
  });

  it('does not re-route primitive or non-retryable provider failures', async () => {
    const mockCreate = vi.fn().mockRejectedValue('provider exploded');
    mockOpenAIClient(mockCreate);

    await expect(generateScriptWithLLM('Title', 'Article')).rejects.toBe(
      'provider exploded',
    );
    expect(mockCreate).toHaveBeenCalledTimes(1);

    const badRequest = providerErrorWithStatus(400);
    mockOpenAIClient(vi.fn().mockRejectedValue(badRequest));
    await expect(generateScriptWithLLM('Title', 'Article')).rejects.toBe(
      badRequest,
    );
  });

  it('reports one attempt record per upstream request', async () => {
    const attempts: LlmAttemptRecord[] = [];
    const mockCreate = vi
      .fn()
      .mockRejectedValueOnce(providerErrorWithStatus(502))
      .mockResolvedValueOnce(successfulCompletion());
    mockOpenAIClient(mockCreate);

    await generateScriptWithLLM('Title', 'Article', {
      onAttempt: (record) => attempts.push(record),
    });

    expect(attempts).toMatchObject([
      {
        operation: 'generateScript',
        attempt: 1,
        status: 'failed',
        errorCategory: 'retry_safe',
        provider: null,
        routing: 'throughput',
        timeoutMs: SCRIPT_TIMEOUT_MS,
      },
      {
        attempt: 2,
        status: 'completed',
        errorCategory: null,
        provider: 'test-provider',
        routing: 'default',
        costUsd: 0.01,
      },
    ]);
    expect(attempts[0]?.inputChars).toBeGreaterThan(0);
    expect(attempts[1]?.outputChars).toBeGreaterThan(0);
  });

  it('never lets a throwing attempt consumer fail the generation', async () => {
    mockOpenAIClient(vi.fn().mockResolvedValue(successfulCompletion()));

    await expect(
      generateScriptWithLLM('Title', 'Article', {
        onAttempt: () => {
          throw new Error('ledger unavailable');
        },
      }),
    ).resolves.toMatchObject({ script: 'Generated script' });
    expect(ingestMocks.logIngestEvent).toHaveBeenCalledWith(
      'llm:attempt-record-failed',
      expect.objectContaining({ attempt: 1 }),
    );
  });
});

describe('generateLanguageClassroomsWithLLM retries', () => {
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
          : Promise.resolve(successfulClassroomCompletion());
      },
    );
    mockOpenAIClient(mockCreate);

    const resultPromise = generateLanguageClassroomsWithLLM(classroomInput);
    const resultAssertion = expect(resultPromise).resolves.toMatchObject({
      model: 'test/model',
      thinkingModel: null,
      provider: 'test-provider',
      costUsd: 0.02,
      lessons: [
        {
          targetLanguageCode: 'ja',
          oneLiner: '市場流動性が再び焦点に',
          script: '流動性とは、資産を素早く現金化できる度合いのことです。',
          keywords: [{ term: '流動性', meaning: '資金進出的難易度' }],
        },
        {
          targetLanguageCode: 'en',
          oneLiner: 'Market liquidity is back in focus',
          script: 'Liquidity is how easily an asset can be converted to cash.',
          keywords: [{ term: 'liquidity', meaning: '資金進出的難易度' }],
        },
      ],
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
        operation: 'generateLanguageClassrooms',
        attempt: 1,
        nextAttempt: 2,
        error: 'OpenRouter request timed out after 25ms',
      }),
    );
  });

  // The incident this loop exists for: HTTP 200, tens of thousands of
  // characters, and a syntax error thousands of characters in. Nothing below
  // this layer ever saw it, so an unescaped quote inside one narration script
  // failed the whole multilingual ingest.
  it('re-prompts a malformed payload on a different endpoint and succeeds', async () => {
    const mockCreate = vi
      .fn()
      .mockResolvedValueOnce(classroomCompletion(malformedClassroomContent(1)))
      .mockResolvedValueOnce(successfulClassroomCompletion());
    mockOpenAIClient(mockCreate);

    const result = await generateLanguageClassroomsWithLLM(classroomInput);

    expect(result.lessons).toHaveLength(2);
    // Both attempts were billed, so both belong on the ledger.
    expect(result.costUsd).toBe(0.04);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(requestProviderRouting(mockCreate, 0)).toEqual({
      sort: 'throughput',
      require_parameters: true,
    });
    expect(requestProviderRouting(mockCreate, 1)).toEqual({
      require_parameters: true,
    });
    expect(ingestMocks.logIngestEvent).toHaveBeenCalledWith(
      'llm:retry',
      expect.objectContaining({
        operation: 'generateLanguageClassrooms',
        layer: 'payload',
        reason: 'invalid_json',
        attempt: 1,
        nextAttempt: 2,
        rerouted: true,
      }),
    );
  });

  // The re-prompt adds the rejection reason; it must not replace the grounding
  // block, or the retry would regenerate the lesson from the title alone.
  it('keeps the article and script grounding in the corrective re-prompt', async () => {
    const mockCreate = vi
      .fn()
      .mockResolvedValueOnce(classroomCompletion(malformedClassroomContent(1)))
      .mockResolvedValueOnce(successfulClassroomCompletion());
    mockOpenAIClient(mockCreate);

    await generateLanguageClassroomsWithLLM(classroomInput);

    expect(requestUserMessage(mockCreate, 0)).not.toContain('修正要求');
    const retryMessage = requestUserMessage(mockCreate, 1);
    expect(retryMessage).toContain('修正要求');
    expect(retryMessage).toContain('標題：市場流動性與升息');
    expect(retryMessage).toContain('文章內容：');
    expect(retryMessage).toContain(classroomInput.articleText);
    expect(retryMessage).toContain('Podcast 講稿：');
    expect(retryMessage).toContain(classroomInput.script);
  });

  // Removing `max_tokens` moved truncation from "the ceiling cut it" to "the
  // provider stopped", and `finish_reason` is the only thing that says so.
  it('retries a truncated payload and reports the finish reason', async () => {
    const mockCreate = vi
      .fn()
      .mockResolvedValue(classroomCompletion('{"lessons":[{"scr', 'length'));
    mockOpenAIClient(mockCreate);

    await expect(
      generateLanguageClassroomsWithLLM(classroomInput),
    ).rejects.toThrow(/was truncated .*finishReason=length/u);

    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  // Three identical failures still have to name the endpoint that served them
  // and quote what broke, or the next incident starts from nothing again.
  it('gives up after three malformed payloads, carrying provider diagnostics', async () => {
    const mockCreate = vi
      .fn()
      .mockResolvedValue(classroomCompletion(malformedClassroomContent(30)));
    mockOpenAIClient(mockCreate);

    const failure = await generateLanguageClassroomsWithLLM(
      classroomInput,
    ).then(
      () => null,
      (error: unknown) => error as Error,
    );

    expect(failure?.message).toContain('provider=test-provider');
    expect(failure?.message).toContain('finishReason=unknown');
    expect(failure?.message).toContain('outputChars=');
    expect(failure?.message).toContain('near: ');
    expect(failure?.message).toContain('引號');
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  // The second production failure, hours after the first: valid JSON, one
  // requested language simply absent. It used to be accepted here, persisted,
  // and then rejected two layers up by assertLanguageClassroomsReady -- past
  // the point where anything could still ask the model again.
  it('re-prompts when a requested target is missing and succeeds', async () => {
    const mockCreate = vi
      .fn()
      .mockResolvedValueOnce(
        classroomCompletion(
          classroomLessonsContent([
            { target: 'ja', script: '流動性の話です。' },
          ]),
        ),
      )
      .mockResolvedValueOnce(successfulClassroomCompletion());
    mockOpenAIClient(mockCreate);

    const result = await generateLanguageClassroomsWithLLM(classroomInput);

    expect(result.lessons.map((lesson) => lesson.targetLanguageCode)).toEqual([
      'ja',
      'en',
    ]);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    // The re-prompt has to name the language that was missing.
    expect(requestUserMessage(mockCreate, 1)).toContain('missing targets: en');
    expect(ingestMocks.logIngestEvent).toHaveBeenCalledWith(
      'llm:retry',
      expect.objectContaining({
        layer: 'payload',
        reason: 'incomplete_targets',
      }),
    );
  });

  // "Missing" has two causes that look identical from the outside: the model
  // never wrote the lesson, or this parser dropped it for a blank script,
  // blank oneLiner, or no usable keyword. They need different fixes.
  it('reports whether the model omitted a target or the parser dropped it', async () => {
    const mockCreate = vi.fn().mockResolvedValue(
      classroomCompletion(
        classroomLessonsContent([
          { target: 'ja', script: '流動性の話です。' },
          { target: 'en', script: '   ' },
        ]),
      ),
    );
    mockOpenAIClient(mockCreate);

    const failure = await generateLanguageClassroomsWithLLM(
      classroomInput,
    ).then(
      () => null,
      (error: unknown) => error as Error,
    );

    expect(failure?.message).toContain('missing targets: en');
    expect(failure?.message).toContain('requested=ja|en');
    expect(failure?.message).toContain('returned=ja|en');
    expect(failure?.message).toContain('accepted=ja');
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  // The inner transport retry replays on the same endpoint. When that endpoint
  // is the degenerate one, the escape is the outer attempt dropping the
  // deterministic throughput sort.
  it('re-routes after the inner transport retry is exhausted', async () => {
    vi.useFakeTimers();
    const mockCreate: Mock = vi.fn(
      (_request: unknown, options?: { signal?: AbortSignal }) => {
        const signal = options?.signal;
        if (!signal) {
          throw new Error('Expected an OpenRouter request signal');
        }
        return mockCreate.mock.calls.length <= 2
          ? timeoutUntilAborted(signal)
          : Promise.resolve(successfulClassroomCompletion());
      },
    );
    mockOpenAIClient(mockCreate);

    const resultPromise = generateLanguageClassroomsWithLLM(classroomInput);
    const resultAssertion = expect(resultPromise).resolves.toMatchObject({
      provider: 'test-provider',
    });
    await vi.runAllTimersAsync();
    await resultAssertion;

    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(requestProviderRouting(mockCreate, 1)).toEqual({
      sort: 'throughput',
      require_parameters: true,
    });
    expect(requestProviderRouting(mockCreate, 2)).toEqual({
      require_parameters: true,
    });
    expect(ingestMocks.logIngestEvent).toHaveBeenCalledWith(
      'llm:retry',
      expect.objectContaining({
        operation: 'generateLanguageClassrooms',
        layer: 'transport',
        attempt: 1,
        nextAttempt: 2,
      }),
    );
  });

  it('does not retry a non-retryable provider error', async () => {
    const providerError = Object.assign(new Error('invalid request'), {
      status: 400,
    });
    const mockCreate = vi.fn().mockRejectedValue(providerError);
    mockOpenAIClient(mockCreate);

    await expect(
      generateLanguageClassroomsWithLLM(classroomInput),
    ).rejects.toBe(providerError);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(ingestMocks.logIngestEvent).not.toHaveBeenCalledWith(
      'llm:retry',
      expect.anything(),
    );
  });
});

describe('createCompletionWithRetry', () => {
  const params = {
    model: 'test/model',
    messages: [{ role: 'user' as const, content: 'Suggest search intents' }],
  };

  function captureRequestSignals(
    signals: AbortSignal[],
    respond: (attempt: number) => Promise<unknown>,
  ): Mock {
    return vi.fn(
      (
        _request: unknown,
        options?: { signal?: AbortSignal },
      ): Promise<unknown> => {
        const signal = options?.signal;
        if (!signal) {
          throw new Error('Expected an OpenRouter request signal');
        }
        signals.push(signal);
        return respond(signals.length);
      },
    );
  }

  it('retries a transport failure on a fresh signal derived from the caller', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const requestSignals: AbortSignal[] = [];
    const providerError = Object.assign(new Error('provider unavailable'), {
      status: 503,
    });
    const mockCreate = captureRequestSignals(requestSignals, (attempt) =>
      attempt === 1
        ? Promise.reject(providerError)
        : Promise.resolve(successfulCompletion()),
    );
    mockOpenAIClient(mockCreate);

    const resultPromise = createCompletionWithRetry(
      getOpenRouterConfig().openai,
      params,
      null,
      'buildVisualSubjectCatalog',
      { signal: controller.signal },
    );
    const resultAssertion = expect(resultPromise).resolves.toMatchObject({
      model: 'test/model',
    });

    await vi.runAllTimersAsync();
    await resultAssertion;

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(requestSignals[0]).not.toBe(requestSignals[1]);
    expect(requestSignals[1]?.aborted).toBe(false);
    expect(ingestMocks.logIngestEvent).toHaveBeenCalledWith(
      'llm:retry',
      expect.objectContaining({
        operation: 'buildVisualSubjectCatalog',
        attempt: 1,
        nextAttempt: 2,
      }),
    );
  });

  it('does not retry once the caller signal has aborted', async () => {
    const controller = new AbortController();
    const stageTimeout = new Error('Visual stage timed out');
    stageTimeout.name = 'TimeoutError';
    const requestSignals: AbortSignal[] = [];
    const mockCreate = captureRequestSignals(requestSignals, () => {
      controller.abort(stageTimeout);
      return Promise.reject(new Error('socket hang up'));
    });
    mockOpenAIClient(mockCreate);

    await expect(
      createCompletionWithRetry(
        getOpenRouterConfig().openai,
        params,
        null,
        'buildVisualSubjectCatalog',
        { signal: controller.signal },
      ),
    ).rejects.toBe(stageTimeout);

    expect(requestSignals[0]?.aborted).toBe(true);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(ingestMocks.logIngestEvent).not.toHaveBeenCalledWith(
      'llm:retry',
      expect.anything(),
    );
  });

  it('retries an SDK connection failure', async () => {
    vi.useFakeTimers();
    const mockCreate = vi
      .fn()
      .mockRejectedValueOnce(sdkConnectionError())
      .mockResolvedValueOnce(successfulCompletion());
    mockOpenAIClient(mockCreate);

    const resultPromise = createCompletionWithRetry(
      getOpenRouterConfig().openai,
      params,
      null,
      'buildVisualSubjectCatalog',
    );
    const resultAssertion = expect(resultPromise).resolves.toMatchObject({
      model: 'test/model',
    });

    await vi.runAllTimersAsync();
    await resultAssertion;

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(ingestMocks.logIngestEvent).toHaveBeenCalledWith(
      'llm:retry',
      expect.objectContaining({
        operation: 'buildVisualSubjectCatalog',
        attempt: 1,
      }),
    );
  });
});
