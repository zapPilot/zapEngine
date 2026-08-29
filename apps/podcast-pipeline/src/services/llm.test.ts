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
  getOpenRouterConfig,
  getOpenRouterTimeoutMs,
  normalizeEditorialTitle,
} from './llm.js';

const ingestMocks = vi.hoisted(() => ({
  logIngestEvent: vi.fn(),
}));

const openAiMocks = vi.hoisted(() => ({
  create: vi.fn(),
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
  openAiMocks.create.mockImplementation((...args: unknown[]) =>
    createMock(...args),
  );
}

function scriptPayload(title: unknown, script: unknown): string {
  return JSON.stringify({ title, script });
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
            create: openAiMocks.create,
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

describe('getOpenRouterConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reuses the client for identical settings and separates relevant settings', () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'memo-api-key');
    vi.stubEnv('OPENROUTER_BASE_URL', 'https://memo.openrouter.test/v1');
    vi.stubEnv('OPENROUTER_TIMEOUT_MS', '30000');
    vi.stubEnv('LLM_MODEL', 'memo/model');
    vi.stubEnv('LLM_THINKING_MODEL', 'memo/thinking-model');
    vi.mocked(OpenAI).mockClear();

    const original = getOpenRouterConfig();
    const repeated = getOpenRouterConfig();
    const withoutThinking = getOpenRouterConfig({ thinkingModel: null });

    expect(repeated.openai).toBe(original.openai);
    expect(withoutThinking.openai).toBe(original.openai);
    expect(withoutThinking.thinkingModel).toBeNull();
    expect(OpenAI).toHaveBeenCalledTimes(1);

    vi.stubEnv('OPENROUTER_BASE_URL', 'https://other.openrouter.test/v1');
    const baseUrlChanged = getOpenRouterConfig();
    vi.stubEnv('OPENROUTER_BASE_URL', 'https://memo.openrouter.test/v1');
    const modelChanged = getOpenRouterConfig({ model: 'memo/other-model' });
    vi.stubEnv('OPENROUTER_TIMEOUT_MS', '45000');
    const timeoutChanged = getOpenRouterConfig();
    vi.stubEnv('OPENROUTER_TIMEOUT_MS', '30000');
    vi.stubEnv('OPENROUTER_API_KEY', 'other-memo-api-key');
    const apiKeyChanged = getOpenRouterConfig();

    expect(baseUrlChanged.openai).not.toBe(original.openai);
    expect(modelChanged.openai).not.toBe(original.openai);
    expect(modelChanged.model).toBe('memo/other-model');
    expect(modelChanged.thinkingModel).toBe('memo/thinking-model');
    expect(timeoutChanged.openai).not.toBe(original.openai);
    expect(apiKeyChanged.openai).not.toBe(original.openai);
    expect(OpenAI).toHaveBeenCalledTimes(5);
  });
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

  it('handles structured message parts when measuring request and response content', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: [
              null,
              { type: 'text', text: 'answer' },
              { type: 'image' },
            ],
          },
        },
      ],
      model: 'test/model',
    });
    const openai = createMockOpenAI(mockCreate) as OpenAI;

    await expect(
      createOpenRouterChatCompletion(
        openai,
        {
          model: 'test/model',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'prompt' },
                {
                  type: 'image_url',
                  image_url: { url: 'https://example.test/image.png' },
                },
              ],
            } as never,
          ],
        },
        null,
      ),
    ).resolves.toMatchObject({ model: 'test/model' });
  });

  it('propagates an already-aborted external signal through the request deadline', async () => {
    const controller = new AbortController();
    const abortReason = new Error('already lost lease');
    controller.abort(abortReason);
    const mockCreate = vi.fn(
      (_request: unknown, options?: { signal?: AbortSignal }) => {
        expect(options?.signal?.aborted).toBe(true);
        expect(options?.signal?.reason).toBe(abortReason);
        return Promise.reject(abortReason);
      },
    );
    const openai = createMockOpenAI(mockCreate) as OpenAI;

    await expect(
      createOpenRouterChatCompletion(
        openai,
        {
          model: 'test/model',
          messages: [{ role: 'user', content: 'align scenes' }],
        },
        null,
        { signal: controller.signal },
      ),
    ).rejects.toBe(abortReason);
  });

  it('enforces the configured timeout with an explicit request deadline', async () => {
    vi.useFakeTimers();
    vi.stubEnv('OPENROUTER_TIMEOUT_MS', '25');
    const mockCreate = vi.fn(
      (_request: unknown, options?: { signal?: AbortSignal }): Promise<never> =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () =>
              reject(
                new DOMException('This operation was aborted', 'AbortError'),
              ),
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

describe('normalizeEditorialTitle', () => {
  it('trims wrapping quotes and converts Simplified Chinese to zh-TW', () => {
    expect(normalizeEditorialTitle('  ‘「软件市场进入新阶段」’  ')).toBe(
      '軟體市場進入新階段',
    );
  });

  it.each([
    '',
    '太短',
    '# 這是 Markdown 標題',
    '**這是粗體標題**',
    '__這是粗體標題__',
    '第一行\n第二行',
    '標'.repeat(61),
    null,
  ])('rejects the invalid editorial title %j', (value) => {
    expect(normalizeEditorialTitle(value)).toBeNull();
  });
});

describe('buildLanguageClassroomUserMessage', () => {
  it('grounds the prompt in the title, article, and script', () => {
    const result = buildLanguageClassroomUserMessage({
      title: 'Title',
      articleText: 'Article',
      script: 'Script',
      sourceLanguageCode: 'zh-Hant',
      targetLanguageCodes: ['ja', 'en'],
    });

    expect(result).toContain('主語言：zh-Hant');
    expect(result).toContain('目標語言：ja, en');
    expect(result).toContain('標題：Title');
    expect(result).toContain('文章內容：\nArticle');
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
    vi.stubEnv('LLM_MODEL', 'test/model');
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

  it('throws when LLM_MODEL is not set and no override is given', async () => {
    vi.stubEnv('LLM_MODEL', '');
    await expect(generateScriptWithLLM('Title', 'Text')).rejects.toThrow(
      'Missing required environment variable: LLM_MODEL',
    );
  });

  it('does not require LLM_MODEL when overrides.model is provided', () => {
    vi.stubEnv('LLM_MODEL', '');

    const config = getOpenRouterConfig({ model: 'override/model' });

    expect(config.model).toBe('override/model');
  });

  it('uses default OpenRouter config when optional fields are absent', async () => {
    vi.stubEnv('OPENROUTER_BASE_URL', '');
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
        model: 'test/model',
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result).toEqual({
      title: null,
      script: 'Script',
      model: 'test/model',
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

  it('returns the editorial title and script from a JSON response', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: scriptPayload(
              '市場流動性正在重新定價',
              '這是生成的講稿內容。',
            ),
          },
        },
      ],
      provider: 'Cloudflare',
      model: 'mistralai/mistral-7b-instruct-v0.1',
      usage: { cost: 0.00001 },
    });

    mockOpenAIClient(mockCreate);

    const result = await generateScriptWithLLM('測試標題', '測試內容');

    expect(result.title).toBe('市場流動性正在重新定價');
    expect(result.script).toBe('這是生成的講稿內容。');
    expect(result.provider).toBe('Cloudflare');
    expect(result.model).toBe('mistralai/mistral-7b-instruct-v0.1');
    expect(result.thinkingModel).toBeNull();
    expect(result.costUsd).toBe(0.00001);
  });

  // These assert the shape of the request we send, never that OpenRouter acted
  // on it. That gap is why `usage` sat inside an `extra_body` wrapper — a
  // Python-SDK-only convention that never reaches the wire from this SDK —
  // while `costUsd` quietly defaulted to 0 for as long as it was there.
  it('requests JSON output, usage accounting and provider routing', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'Script' } }],
      provider: 'Cloudflare',
      model: 'test/model',
    });

    mockOpenAIClient(mockCreate);

    await generateScriptWithLLM('Title', 'Text');

    const callArgs = mockCreate.mock.calls[0]![0] as {
      extra_body?: unknown;
      usage?: object;
      provider?: object;
      response_format?: object;
    };
    expect(callArgs.response_format).toEqual({ type: 'json_object' });
    expect(callArgs.usage).toEqual({ include: true });
    expect(callArgs.provider).toEqual({
      sort: 'throughput',
      require_parameters: true,
    });
    expect(callArgs.extra_body).toBeUndefined();
  });

  it('accepts a fenced JSON response', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: `\`\`\`json
${scriptPayload('「软件市场进入新阶段」', '生成講稿')}
\`\`\``,
          },
        },
      ],
      provider: 'Cloudflare',
      model: 'test/model',
    });
    mockOpenAIClient(mockCreate);

    const result = await generateScriptWithLLM('Title', 'Text');

    expect(result).toMatchObject({
      title: '軟體市場進入新階段',
      script: '生成講稿',
    });
  });

  it('preserves a plain-text response as a script-only fallback', async () => {
    ingestMocks.logIngestEvent.mockClear();
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'Legacy generated script' } }],
      provider: 'Cloudflare',
      model: 'test/model',
    });
    mockOpenAIClient(mockCreate);

    const result = await generateScriptWithLLM('Title', 'Text');

    expect(result).toMatchObject({
      title: null,
      script: 'Legacy generated script',
    });
    expect(ingestMocks.logIngestEvent).toHaveBeenCalledWith(
      'llm:title-fallback',
      { reason: 'plain_text_response' },
    );
  });

  it('keeps the script and records a missing-title fallback when JSON omits the title', async () => {
    ingestMocks.logIngestEvent.mockClear();
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ script: 'Script' }) } }],
      provider: 'Cloudflare',
      model: 'test/model',
    });
    mockOpenAIClient(mockCreate);

    const result = await generateScriptWithLLM('Title', 'Text');

    expect(result).toMatchObject({ title: null, script: 'Script' });
    expect(ingestMocks.logIngestEvent).toHaveBeenCalledWith(
      'llm:title-fallback',
      { reason: 'missing_title' },
    );
  });

  it('keeps the script when the JSON title is invalid', async () => {
    ingestMocks.logIngestEvent.mockClear();
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [
        { message: { content: scriptPayload('# Markdown title', 'Script') } },
      ],
      provider: 'Cloudflare',
      model: 'test/model',
    });
    mockOpenAIClient(mockCreate);

    const result = await generateScriptWithLLM('Title', 'Text');

    expect(result).toMatchObject({ title: null, script: 'Script' });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(ingestMocks.logIngestEvent).toHaveBeenCalledWith(
      'llm:title-fallback',
      { reason: 'invalid_title' },
    );
  });

  it('re-asks once when a JSON-shaped response is invalid', async () => {
    const mockCreate = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"title":' } }],
        provider: 'Cloudflare',
        model: 'test/model',
        usage: { cost: 0.01 },
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: scriptPayload('市場流動性正在重新定價', 'Script'),
            },
          },
        ],
        provider: 'Cloudflare',
        model: 'test/model',
        usage: { cost: 0.02 },
      });
    mockOpenAIClient(mockCreate);

    const result = await generateScriptWithLLM('Title', 'Text');

    expect(result).toMatchObject({
      title: '市場流動性正在重新定價',
      script: 'Script',
    });
    expect(result.costUsd).toBeCloseTo(0.03, 10);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    const retryRequest = mockCreate.mock.calls[1]![0] as {
      messages: { role: string; content: string }[];
      response_format?: object;
    };
    expect(retryRequest.response_format).toEqual({ type: 'json_object' });
    expect(retryRequest.messages.at(-1)?.content).toContain(
      '上一個回應未符合 JSON 輸出契約（invalid_json）',
    );
  });

  it.each([
    ['opening_greeting', '歡迎收聽今天的節目。正文從市場變化開始。'],
    ['closing_cta', '正文分析市場變化。\n\n記得訂閱並分享這個節目。'],
    ['markdown_heading', '# 市場標題\n正文分析市場變化。'],
    ['timestamp', '[00:15] 正文分析市場變化。'],
    ['separator', '正文分析市場變化。\n\n---\n\n下一段正文。'],
  ])(
    'retries a %s instead of accepting application-owned packaging',
    async (detail, invalidScript) => {
      const mockCreate = vi
        .fn()
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                content: scriptPayload('市場流動性正在重新定價', invalidScript),
              },
            },
          ],
          provider: 'Cloudflare',
          model: 'test/model',
        })
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                content: scriptPayload(
                  '市場流動性正在重新定價',
                  '正文分析市場變化。',
                ),
              },
            },
          ],
          provider: 'Cloudflare',
          model: 'test/model',
        });
      mockOpenAIClient(mockCreate);

      const result = await generateScriptWithLLM('Title', 'Text');

      expect(result.script).toBe('正文分析市場變化。');
      expect(mockCreate).toHaveBeenCalledTimes(2);
      const retryRequest = mockCreate.mock.calls[1]![0] as {
        messages: { role: string; content: string }[];
      };
      expect(retryRequest.messages.at(-1)?.content).toContain(
        `上一個回應未符合 JSON 輸出契約（packaged_body: ${detail}）`,
      );
    },
  );

  it('fails after the second response still contains application-owned packaging', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: scriptPayload(
              '市場流動性正在重新定價',
              '歡迎收聽今天的節目。正文從市場變化開始。',
            ),
          },
        },
      ],
      provider: 'Cloudflare',
      model: 'test/model',
    });
    mockOpenAIClient(mockCreate);

    await expect(generateScriptWithLLM('Title', 'Text')).rejects.toThrow(
      'application-owned packaging: opening_greeting',
    );
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('throws after two JSON payloads omit a usable script', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: scriptPayload('市場流動性正在重新定價', '   '),
          },
        },
      ],
      provider: 'Cloudflare',
      model: 'test/model',
    });
    mockOpenAIClient(mockCreate);

    await expect(generateScriptWithLLM('Title', 'Text')).rejects.toThrow(
      'LLM returned empty script content',
    );
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  // The shared timeout is stubbed and then expected *not* to appear: script
  // generation runs on its own ten-minute deadline, so a change that quietly
  // put it back on the shared one fails here.
  it('logs safe request and response metadata without prompt or completion content', async () => {
    vi.stubEnv('OPENROUTER_TIMEOUT_MS', '45000');
    ingestMocks.logIngestEvent.mockClear();

    const title = 'Sensitive article title';
    const articleText = 'Sensitive article body that must not be logged';
    const generatedTitle = 'Sensitive generated title that must not be logged';
    const generatedScript =
      'Sensitive generated script that must not be logged';
    const generatedPayload = scriptPayload(generatedTitle, generatedScript);
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: generatedPayload } }],
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
        timeoutMs: 600_000,
        maxTokens: 'unset',
        reasoning: 'provider-default',
      },
    );
    expect(ingestMocks.logIngestEvent).toHaveBeenNthCalledWith(
      2,
      'llm:response',
      {
        model: 'resolved/model',
        thinking: false,
        inputChars,
        timeoutMs: 600_000,
        provider: 'Cloudflare',
        costUsd: 0.00001,
        outputChars: generatedPayload.length,
      },
    );

    const logs = JSON.stringify(ingestMocks.logIngestEvent.mock.calls);
    expect(logs).not.toContain(articleText);
    expect(logs).not.toContain(generatedTitle);
    expect(logs).not.toContain(generatedScript);
    expect(logs).not.toContain('test-api-key');
  });

  // `llm:response` is the only line carrying the provider, so a failed request
  // used to leave nothing behind at all. It still must not be logged — the
  // request never produced one — but the failure now has to say what was asked.
  it('logs a failure instead of a response when the request fails', async () => {
    ingestMocks.logIngestEvent.mockClear();
    const timeoutError = new Error('Request timed out');
    const mockCreate = vi.fn().mockRejectedValue(timeoutError);
    mockOpenAIClient(mockCreate);

    await expect(generateScriptWithLLM('Title', 'Text')).rejects.toBe(
      timeoutError,
    );

    const events = ingestMocks.logIngestEvent.mock.calls.map(
      (call: unknown[]) => call[0] as string,
    );
    expect(events).toEqual(['llm:request', 'llm:failed']);
    expect(ingestMocks.logIngestEvent).toHaveBeenCalledWith(
      'llm:request',
      expect.objectContaining({
        model: 'test/model',
        timeoutMs: 600_000,
      }),
    );
    expect(ingestMocks.logIngestEvent).toHaveBeenCalledWith(
      'llm:failed',
      expect.objectContaining({
        model: 'test/model',
        timeoutMs: 600_000,
        maxTokens: 'unset',
        reasoning: 'provider-default',
        routing: 'throughput',
        error: 'Request timed out',
      }),
    );
  });

  // OpenRouter has no per-request "think with a different model" field; its
  // knob is `reasoning`. LLM_THINKING_MODEL therefore only records provenance
  // on the row, and nothing about it is sent upstream.
  it('records the configured thinking model without sending it upstream', async () => {
    vi.stubEnv('LLM_THINKING_MODEL', 'anthropic/claude-3-opus');

    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: 'Script with thinking' } }],
      provider: 'Cloudflare',
      model: 'test/model',
    });

    mockOpenAIClient(mockCreate);

    const result = await generateScriptWithLLM('Title', 'Text');

    expect(result.thinkingModel).toBe('anthropic/claude-3-opus');
    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs['extra_body']).toBeUndefined();
    expect(callArgs['thinking']).toBeUndefined();
    expect(callArgs['usage']).toEqual({ include: true });
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
    expect(mockCreate).toHaveBeenCalledTimes(1);
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

  // The classroom call is the heaviest generation in the pipeline: one response
  // carries a full narration script per target language. Left unbounded it hit
  // the request deadline instead of returning, so these three constraints are
  // load-bearing, not decoration.
  it('bounds the request with JSON mode, an output ceiling and reasoning off', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: validLanguageClassroomPayload() } }],
      provider: 'Cloudflare',
      model: 'test/model',
      usage: { cost: 0.00002 },
    });

    mockOpenAIClient(mockCreate);

    await generateLanguageClassroomsWithLLM({
      title: '市場流動性',
      articleText: '這篇文章解釋市場流動性與資金進出。',
      script: '大家好，今天談市場流動性。',
      sourceLanguageCode: 'zh-Hant',
      targetLanguageCodes: ['ja', 'en'],
    });

    const callArgs = mockCreate.mock.calls[0]![0] as {
      response_format?: object;
      max_tokens?: number;
      reasoning?: object;
      provider?: object;
      usage?: object;
    };
    expect(callArgs.response_format).toEqual({ type: 'json_object' });
    expect(callArgs.max_tokens).toBe(8000);
    expect(callArgs.reasoning).toEqual({ enabled: false });
    expect(callArgs.provider).toEqual({
      sort: 'throughput',
      require_parameters: true,
    });
    expect(callArgs.usage).toEqual({ include: true });
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
                  script:
                    '流動性とは、資産を素早く現金化できる度合いのことです。',
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
                  script:
                    'Liquidity is how easily an asset can be converted to cash.',
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
      articleText: '這篇文章解釋市場流動性與資金進出。',
      script: '大家好，今天談市場流動性。',
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
      articleText: '這篇文章解釋市場流動性與資金進出。',
      script: '大家好，今天談市場流動性。',
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
          articleText: 'Article',
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
        articleText: 'Article',
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
        articleText: 'Article',
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
        script: '流動性とは、資産を素早く現金化できる度合いのことです。',
      },
    ],
  });
}
