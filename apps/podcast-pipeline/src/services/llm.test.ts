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
  generateLanguageClassroomsWithLLM,
  generateScriptWithLLM,
} from './llm.js';

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

  it('uses default OpenRouter config and empty script fallbacks when optional fields are absent', async () => {
    vi.stubEnv('OPENROUTER_BASE_URL', '');
    vi.stubEnv('LLM_MODEL', '');
    vi.stubEnv('LLM_THINKING_MODEL', '');
    vi.mocked(OpenAI).mockClear();

    const mockCreate = vi.fn().mockResolvedValue({
      choices: [],
      provider: null,
      model: null,
    });

    mockOpenAIClient(mockCreate);

    const result = await generateScriptWithLLM('Title', 'Text');

    expect(OpenAI).toHaveBeenCalledWith({
      apiKey: 'test-api-key',
      baseURL: 'https://openrouter.ai/api/v1',
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'anthropic/claude-3-5-sonnet-20241022',
      }),
    );
    expect(result).toEqual({
      script: '',
      model: 'anthropic/claude-3-5-sonnet-20241022',
      thinkingModel: null,
      provider: 'unknown',
      costUsd: 0,
    });
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

  it('returns empty script when API returns no content', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: null } }],
      provider: 'Cloudflare',
      model: 'test/model',
    });

    mockOpenAIClient(mockCreate);

    const result = await generateScriptWithLLM('Title', 'Text');

    expect(result.script).toBe('');
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
