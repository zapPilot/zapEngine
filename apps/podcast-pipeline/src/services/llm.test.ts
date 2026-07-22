import { readFileSync } from 'node:fs';

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

import {
  buildLanguageClassroomUserMessage,
  buildUserMessage,
  createOpenRouterChatCompletion,
  DEFAULT_OPENROUTER_TIMEOUT_MS,
  generateLanguageClassroomsWithLLM,
  generateScriptWithLLM,
  getOpenRouterTimeoutMs,
} from './llm.js';

const ingestMocks = vi.hoisted(() => ({
  logIngestEvent: vi.fn(),
}));

const createMockOpenAI = (createMock: Mock): unknown => {
  return {
    chat: {
      completions: {
        create: createMock,
      },
    },
  };
};

function mockOpenAIClient(createMock: Mock): void {
  vi.mocked(OpenAI).mockImplementation(function () {
    return createMockOpenAI(createMock) as OpenAI;
  });
}

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    readFileSync: vi.fn((path: string): string => {
      if (typeof path === 'string' && path.includes('script-system-prompt')) {
        return '你是一個 Podcast 講稿生成助手。請根據標題和內容生成簡短的講稿。';
      }
      return actual.readFileSync(path, 'utf8');
    }),
  };
});

vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return {
        chat: {
          completions: {
            create: vi.fn(),
          },
        },
      };
    }),
  };
});

vi.mock('./ingest/step.js', () => ingestMocks);

describe('getOpenRouterTimeoutMs', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses 120 seconds when no timeout is configured', () => {
    vi.stubEnv('OPENROUTER_TIMEOUT_MS', '');
    expect(getOpenRouterTimeoutMs()).toBe(DEFAULT_OPENROUTER_TIMEOUT_MS);
  });

  it('uses a valid positive integer timeout', () => {
    expect(getOpenRouterTimeoutMs('45000')).toBe(45_000);
  });

  it.each(['', '0', '-1', '1.5', 'not-a-number', 'Infinity'])(
    'falls back to the default for an invalid timeout of %j',
    (value) => {
      expect(getOpenRouterTimeoutMs(value)).toBe(DEFAULT_OPENROUTER_TIMEOUT_MS);
    },
  );
});

describe('createOpenRouterChatCompletion', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('passes the abort signal to the OpenAI request and rejects when aborted', async () => {
    const controller = new AbortController();
    const abortReason = new Error('video lease lost');
    const mockCreate = vi.fn(
      (_request: unknown, options?: { signal?: AbortSignal }): Promise<never> =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(abortReason),
            { once: true },
          );
        }),
    );
    const openai = createMockOpenAI(mockCreate) as OpenAI;

    const completion = createOpenRouterChatCompletion(
      openai,
      {
        model: 'test/model',
        messages: [{ role: 'user', content: 'align scenes' }],
      },
      null,
      { signal: controller.signal },
    );
    controller.abort(abortReason);

    await expect(completion).rejects.toBe(abortReason);
    const requestSignal: AbortSignal | undefined =
      mockCreate.mock.calls[0]?.[1]?.signal;
    if (!requestSignal) {
      throw new Error('Expected OpenRouter request signal');
    }
    expect(requestSignal).not.toBe(controller.signal);
    expect(requestSignal.aborted).toBe(true);
    expect(requestSignal.reason).toBe(abortReason);
  });

  it('enforces the configured timeout with an explicit request deadline', async () => {
    vi.useFakeTimers();
    vi.stubEnv('OPENROUTER_TIMEOUT_MS', '25');
    const mockCreate = vi.fn(
      (_request: unknown, options?: { signal?: AbortSignal }): Promise<never> =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => {
              const reason = options.signal?.reason;
              reject(
                reason instanceof Error
                  ? reason
                  : new Error('OpenRouter request aborted'),
              );
            },
            { once: true },
          );
        }),
    );
    const openai = createMockOpenAI(mockCreate) as OpenAI;

    const completion = createOpenRouterChatCompletion(
      openai,
      {
        model: 'test/model',
        messages: [{ role: 'user', content: 'align scenes' }],
      },
      null,
    );
    const rejection = expect(completion).rejects.toThrow(
      'OpenRouter request timed out after 25ms',
    );
    await vi.advanceTimersByTimeAsync(25);

    await rejection;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the deadline after a successful response', async () => {
    vi.useFakeTimers();
    vi.stubEnv('OPENROUTER_TIMEOUT_MS', '25');
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'ok' } }],
      model: 'test/model',
    });
    const openai = createMockOpenAI(mockCreate) as OpenAI;

    await createOpenRouterChatCompletion(
      openai,
      {
        model: 'test/model',
        messages: [{ role: 'user', content: 'align scenes' }],
      },
      null,
    );

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('buildUserMessage', () => {
  it('formats title in 標題： prefix', () => {
    const result = buildUserMessage('Test Title', 'Some content');
    expect(result).toContain('標題：Test Title');
  });

  it('formats text in 內容： prefix', () => {
    const result = buildUserMessage('Test Title', 'Some content');
    expect(result).toContain('內容：\nSome content');
  });

  it('combines title and text with newlines', () => {
    const result = buildUserMessage('Title', 'Content');
    expect(result).toBe('標題：Title\n\n內容：\nContent');
  });
});

describe('buildLanguageClassroomUserMessage', () => {
  it('includes source and target languages', () => {
    const result = buildLanguageClassroomUserMessage({
      title: 'Title',
      articleText: 'Article',
      script: 'Script',
      sourceLanguageCode: 'zh-Hant',
      targetLanguageCodes: ['ja', 'en'],
    });

    expect(result).toContain('主語言：zh-Hant');
    expect(result).toContain('目標語言：ja, en');
    expect(result).toContain('Podcast 講稿：\nScript');
  });
});

describe('getSystemPrompt error handling', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws when prompt file cannot be read', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-api-key');
    vi.stubEnv('SCRIPT_PROMPT_PATH', '/nonexistent/prompt.txt');

    const { generateScriptWithLLM: freshGenerate } = await import('./llm.js');
    await expect(freshGenerate('Title', 'Text')).rejects.toThrow(
      /Prompt file not found at/,
    );
  });

  it('loads the default prompt from the app prompts directory', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-api-key');
    vi.stubEnv('OPENROUTER_BASE_URL', 'https://test.openrouter.ai/api/v1');
    vi.stubEnv('LLM_MODEL', 'test/model');
    vi.stubEnv('LLM_THINKING_MODEL', '');
    vi.stubEnv('SCRIPT_PROMPT_PATH', '');
    vi.mocked(readFileSync).mockClear();

    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'Script' } }],
      provider: 'Cloudflare',
      model: 'test/model',
    });
    mockOpenAIClient(mockCreate);

    const { generateScriptWithLLM: freshGenerate } = await import('./llm.js');
    await freshGenerate('Title', 'Text');

    expect(readFileSync).toHaveBeenCalledWith(
      expect.stringMatching(
        /apps\/podcast-pipeline\/prompts\/script-system-prompt\.txt$/,
      ),
      'utf8',
    );
  });

  it('resolves a relative SCRIPT_PROMPT_PATH against the package root', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-api-key');
    vi.stubEnv('OPENROUTER_BASE_URL', 'https://test.openrouter.ai/api/v1');
    vi.stubEnv('LLM_MODEL', 'test/model');
    vi.stubEnv('LLM_THINKING_MODEL', '');
    vi.stubEnv('SCRIPT_PROMPT_PATH', 'prompts/script-system-prompt.txt');
    vi.mocked(readFileSync).mockClear();

    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'Script' } }],
      provider: 'Cloudflare',
      model: 'test/model',
    });
    mockOpenAIClient(mockCreate);

    const { generateScriptWithLLM: freshGenerate } = await import('./llm.js');
    await freshGenerate('Title', 'Text');

    expect(readFileSync).toHaveBeenCalledWith(
      expect.stringMatching(
        /apps\/podcast-pipeline\/prompts\/script-system-prompt\.txt$/,
      ),
      'utf8',
    );
  });

  it('reuses the cached system prompt after the first read', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-api-key');
    vi.stubEnv('OPENROUTER_BASE_URL', 'https://test.openrouter.ai/api/v1');
    vi.stubEnv('LLM_MODEL', 'test/model');
    vi.stubEnv('LLM_THINKING_MODEL', '');
    vi.stubEnv('SCRIPT_PROMPT_PATH', '');
    vi.mocked(readFileSync).mockClear();

    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'Script' } }],
      provider: 'Cloudflare',
      model: 'test/model',
    });
    mockOpenAIClient(mockCreate);

    const { generateScriptWithLLM: freshGenerate } = await import('./llm.js');
    await freshGenerate('Title one', 'Text one');
    await freshGenerate('Title two', 'Text two');

    expect(readFileSync).toHaveBeenCalledTimes(1);
  });
});

describe('generateScriptWithLLM', () => {
  beforeEach(() => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-api-key');
    vi.stubEnv('OPENROUTER_BASE_URL', 'https://test.openrouter.ai/api/v1');
    vi.stubEnv('OPENROUTER_TIMEOUT_MS', '');
    vi.stubEnv('LLM_MODEL', 'test/model');
    vi.stubEnv('LLM_THINKING_MODEL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws error when OPENROUTER_API_KEY is not set', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    await expect(generateScriptWithLLM('Title', 'Text')).rejects.toThrow(
      'OPENROUTER_API_KEY not set',
    );
  });

  it('uses default OpenRouter config when optional fields are absent', async () => {
    vi.stubEnv('OPENROUTER_BASE_URL', '');
    vi.stubEnv('LLM_MODEL', '');
    vi.stubEnv('LLM_THINKING_MODEL', '');
    vi.mocked(OpenAI).mockClear();

    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'Script' } }],
      provider: null,
      model: null,
    });

    mockOpenAIClient(mockCreate);

    const result = await generateScriptWithLLM('Title', 'Text');

    expect(OpenAI).toHaveBeenCalledWith({
      apiKey: 'test-api-key',
      baseURL: 'https://openrouter.ai/api/v1',
      timeout: DEFAULT_OPENROUTER_TIMEOUT_MS,
      maxRetries: 0,
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'anthropic/claude-3-5-sonnet-20241022',
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result).toEqual({
      script: 'Script',
      model: 'anthropic/claude-3-5-sonnet-20241022',
      thinkingModel: null,
      provider: 'unknown',
      costUsd: 0,
    });
  });

  it('configures a valid OpenRouter timeout and disables SDK retries', async () => {
    vi.stubEnv('OPENROUTER_TIMEOUT_MS', '45000');
    vi.mocked(OpenAI).mockClear();

    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'Script' } }],
      provider: 'Cloudflare',
      model: 'test/model',
    });
    mockOpenAIClient(mockCreate);

    await generateScriptWithLLM('Title', 'Text');

    expect(OpenAI).toHaveBeenCalledWith({
      apiKey: 'test-api-key',
      baseURL: 'https://test.openrouter.ai/api/v1',
      timeout: 45_000,
      maxRetries: 0,
    });
  });

  it('falls back to the default timeout for an invalid environment value', async () => {
    vi.stubEnv('OPENROUTER_TIMEOUT_MS', 'not-a-number');
    vi.mocked(OpenAI).mockClear();

    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'Script' } }],
      provider: 'Cloudflare',
      model: 'test/model',
    });
    mockOpenAIClient(mockCreate);

    await generateScriptWithLLM('Title', 'Text');

    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: DEFAULT_OPENROUTER_TIMEOUT_MS,
        maxRetries: 0,
      }),
    );
  });

  it('returns script from mocked OpenRouter API response', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '這是生成的講稿內容。' } }],
      provider: 'Cloudflare',
      model: 'mistralai/mistral-7b-instruct-v0.1',
      usage: { cost: 0.00001 },
    });

    mockOpenAIClient(mockCreate);

    const result = await generateScriptWithLLM('測試標題', '測試內容');

    expect(result.script).toBe('這是生成的講稿內容。');
    expect(result.provider).toBe('Cloudflare');
    expect(result.model).toBe('mistralai/mistral-7b-instruct-v0.1');
    expect(result.thinkingModel).toBeNull();
    expect(result.costUsd).toBe(0.00001);
  });

  it('requests OpenRouter usage accounting', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'Script' } }],
      provider: 'Cloudflare',
      model: 'test/model',
    });

    mockOpenAIClient(mockCreate);

    await generateScriptWithLLM('Title', 'Text');

    const callArgs = mockCreate.mock.calls[0]![0] as {
      extra_body?: { usage?: object };
    };
    expect(callArgs.extra_body?.usage).toEqual({ include: true });
  });

  it('logs safe request and response metadata without prompt or completion content', async () => {
    vi.stubEnv('OPENROUTER_TIMEOUT_MS', '45000');
    ingestMocks.logIngestEvent.mockClear();

    const title = 'Sensitive article title';
    const articleText = 'Sensitive article body that must not be logged';
    const generatedScript =
      'Sensitive generated script that must not be logged';
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: generatedScript } }],
      provider: 'Cloudflare',
      model: 'resolved/model',
      usage: { cost: 0.00001 },
    });
    mockOpenAIClient(mockCreate);

    await generateScriptWithLLM(title, articleText);

    const inputChars = buildUserMessage(title, articleText).length;
    expect(ingestMocks.logIngestEvent).toHaveBeenNthCalledWith(
      1,
      'llm:request',
      {
        model: 'test/model',
        thinking: false,
        inputChars,
        timeoutMs: 45_000,
      },
    );
    expect(ingestMocks.logIngestEvent).toHaveBeenNthCalledWith(
      2,
      'llm:response',
      {
        model: 'resolved/model',
        thinking: false,
        inputChars,
        timeoutMs: 45_000,
        provider: 'Cloudflare',
        costUsd: 0.00001,
        outputChars: generatedScript.length,
      },
    );

    const logs = JSON.stringify(ingestMocks.logIngestEvent.mock.calls);
    expect(logs).not.toContain(articleText);
    expect(logs).not.toContain(generatedScript);
    expect(logs).not.toContain('test-api-key');
  });

  it('does not log an LLM response when the request fails', async () => {
    ingestMocks.logIngestEvent.mockClear();
    const timeoutError = new Error('Request timed out');
    const mockCreate = vi.fn().mockRejectedValue(timeoutError);
    mockOpenAIClient(mockCreate);

    await expect(generateScriptWithLLM('Title', 'Text')).rejects.toBe(
      timeoutError,
    );

    expect(ingestMocks.logIngestEvent).toHaveBeenCalledTimes(1);
    expect(ingestMocks.logIngestEvent).toHaveBeenCalledWith(
      'llm:request',
      expect.objectContaining({
        model: 'test/model',
        timeoutMs: DEFAULT_OPENROUTER_TIMEOUT_MS,
      }),
    );
  });

  it('uses thinking model when configured', async () => {
    vi.stubEnv('LLM_THINKING_MODEL', 'anthropic/claude-3-opus');

    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'Script with thinking' } }],
      provider: 'Cloudflare',
      model: 'test/model',
    });

    mockOpenAIClient(mockCreate);

    await generateScriptWithLLM('Title', 'Text');

    expect(mockCreate).toHaveBeenCalled();
    const callArgs = mockCreate.mock.calls[0]![0] as {
      extra_body?: { thinking?: object; usage?: object };
    };
    expect(callArgs.extra_body).toBeDefined();
    expect(callArgs.extra_body?.thinking).toEqual({
      type: 'optimized',
      model: 'anthropic/claude-3-opus',
    });
    expect(callArgs.extra_body?.usage).toEqual({ include: true });
  });

  it.each([
    ['missing usage', undefined],
    ['non-numeric usage cost', { cost: '0.00001' }],
  ])('defaults cost to zero for %s', async (_label, usage) => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'Script' } }],
      provider: 'Cloudflare',
      model: 'test/model',
      usage,
    });

    mockOpenAIClient(mockCreate);

    const result = await generateScriptWithLLM('Title', 'Text');

    expect(result.costUsd).toBe(0);
  });

  it('rejects when the API returns no script content', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: null } }],
      provider: 'Cloudflare',
      model: 'test/model',
    });

    mockOpenAIClient(mockCreate);

    await expect(generateScriptWithLLM('Title', 'Text')).rejects.toThrow(
      'LLM returned empty script content',
    );
  });

  it('returns unknown provider when API returns null provider', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'Script' } }],
      provider: null,
      model: 'test/model',
    });

    mockOpenAIClient(mockCreate);

    const result = await generateScriptWithLLM('Title', 'Text');

    expect(result.provider).toBe('unknown');
  });

  it('returns unknown provider when API returns empty string provider', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'Script' } }],
      provider: '',
      model: 'test/model',
    });

    mockOpenAIClient(mockCreate);

    const result = await generateScriptWithLLM('Title', 'Text');

    expect(result.provider).toBe('unknown');
  });

  it('falls back to env model when API returns null model', async () => {
    vi.stubEnv('LLM_MODEL', 'fallback/model');

    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'Script' } }],
      provider: 'Cloudflare',
      model: null,
    });

    mockOpenAIClient(mockCreate);

    const result = await generateScriptWithLLM('Title', 'Text');

    expect(result.model).toBe('fallback/model');
  });

  it('falls back to unknown when API returns empty string provider', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'Script' } }],
      provider: '',
      model: 'test/model',
    });

    mockOpenAIClient(mockCreate);

    const result = await generateScriptWithLLM('Title', 'Text');

    expect(result.provider).toBe('unknown');
  });
});

describe('generateLanguageClassroomsWithLLM', () => {
  beforeEach(() => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-api-key');
    vi.stubEnv('OPENROUTER_BASE_URL', 'https://test.openrouter.ai/api/v1');
    vi.stubEnv('OPENROUTER_TIMEOUT_MS', '');
    vi.stubEnv('LLM_MODEL', 'test/model');
    vi.stubEnv('LLM_THINKING_MODEL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns parsed language classroom lessons from JSON response', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              lessons: [
                {
                  targetLanguageCode: 'ja',
                  oneLiner: 'この記事は市場流動性を説明します。',
                  keywords: [
                    {
                      term: '流動性',
                      reading: 'りゅうどうせい',
                      meaning: '資金容易進出市場的程度',
                      note: '市場分析常用詞',
                    },
                  ],
                },
                {
                  targetLanguageCode: 'en',
                  oneLiner: 'This article explains market liquidity.',
                  keywords: [
                    {
                      term: 'liquidity',
                      reading: null,
                      meaning: '資金容易進出市場的程度',
                      note: null,
                    },
                  ],
                },
              ],
            }),
          },
        },
      ],
      provider: 'Cloudflare',
      model: 'test/model',
      usage: { cost: 0.00002 },
    });

    mockOpenAIClient(mockCreate);

    const result = await generateLanguageClassroomsWithLLM({
      title: '市場流動性',
      articleText: '文章內容',
      script: '講稿內容',
      sourceLanguageCode: 'zh-Hant',
      targetLanguageCodes: ['ja', 'en'],
    });

    expect(result.lessons).toHaveLength(2);
    expect(result.lessons[0]!.targetLanguageCode).toBe('ja');
    expect(result.lessons[0]!.keywords[0]!.term).toBe('流動性');
    expect(result.lessons[1]!.targetLanguageCode).toBe('en');
    expect(result.lessons[1]!.keywords[0]!.term).toBe('liquidity');
    expect(result.provider).toBe('Cloudflare');
    expect(result.costUsd).toBe(0.00002);
  });

  it('parses language classroom lessons from a fenced JSON response', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: `\`\`\`json
${validLanguageClassroomPayload()}
\`\`\``,
          },
        },
      ],
      provider: 'Cloudflare',
      model: 'test/model',
      usage: { cost: 0.00003 },
    });

    mockOpenAIClient(mockCreate);

    const result = await generateLanguageClassroomsWithLLM({
      title: '市場流動性',
      articleText: '文章內容',
      script: '講稿內容',
      sourceLanguageCode: 'zh-Hant',
      targetLanguageCodes: ['ja'],
    });

    expect(result.lessons[0]!.targetLanguageCode).toBe('ja');
  });

  it.each([
    ['array JSON', '[]', 'Language classroom response must be a JSON object'],
    [
      'non-array lessons',
      '{}',
      'Language classroom response did not contain any valid lessons',
    ],
    ['unterminated fence', '```json', 'Unexpected token'],
    [
      'unsupported fence language',
      '```txt\n{"lessons":[]}\n```',
      'Unexpected token',
    ],
    [
      'trailing text after fence',
      '```json\n{"lessons":[]}\n``` trailing',
      'Unexpected token',
    ],
  ])(
    'throws for invalid language classroom JSON: %s',
    async (_label, content, message) => {
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [{ message: { content } }],
        provider: 'Cloudflare',
        model: 'test/model',
      });

      mockOpenAIClient(mockCreate);

      await expect(
        generateLanguageClassroomsWithLLM({
          title: 'Title',
          articleText: 'Text',
          script: 'Script',
          sourceLanguageCode: 'zh-Hant',
          targetLanguageCodes: ['ja'],
        }),
      ).rejects.toThrow(message);
    },
  );

  it('throws when the classroom completion has no message content', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [],
      provider: 'Cloudflare',
      model: 'test/model',
    });

    mockOpenAIClient(mockCreate);

    await expect(
      generateLanguageClassroomsWithLLM({
        title: 'Title',
        articleText: 'Text',
        script: 'Script',
        sourceLanguageCode: 'zh-Hant',
        targetLanguageCodes: ['ja'],
      }),
    ).rejects.toThrow('Unexpected end of JSON input');
  });

  it('throws when response has no valid lessons', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: '{"lessons":[]}' } }],
      provider: 'Cloudflare',
      model: 'test/model',
    });

    mockOpenAIClient(mockCreate);

    await expect(
      generateLanguageClassroomsWithLLM({
        title: 'Title',
        articleText: 'Text',
        script: 'Script',
        sourceLanguageCode: 'zh-Hant',
        targetLanguageCodes: ['ja'],
      }),
    ).rejects.toThrow(
      'Language classroom response did not contain any valid lessons',
    );
  });
});

function validLanguageClassroomPayload(): string {
  return JSON.stringify({
    lessons: [
      {
        targetLanguageCode: 'ja',
        oneLiner: 'この記事は市場流動性を説明します。',
        keywords: [
          {
            term: '流動性',
            reading: 'りゅうどうせい',
            meaning: '資金流動性',
            note: null,
          },
        ],
      },
    ],
  });
}
