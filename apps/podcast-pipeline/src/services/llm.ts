import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import OpenAI from 'openai';

import { normalizeLanguageClassroomLesson } from '../lib/languageClassroom.js';
import type {
  LanguageClassroomLanguageCode,
  LanguageClassroomLesson,
} from '../types.js';

export interface ScriptResult {
  script: string;
  model: string;
  thinkingModel: string | null;
  provider: string;
  costUsd: number;
}

export interface LanguageClassroomResult {
  lessons: LanguageClassroomLesson[];
  model: string;
  thinkingModel: string | null;
  provider: string;
  costUsd: number;
}

export interface UnifiedKeywordsResult {
  keywords: string[];
  model: string;
  thinkingModel: string | null;
  provider: string;
  costUsd: number;
}

export interface LanguageClassroomInput {
  title: string;
  articleText: string;
  script: string;
  sourceLanguageCode: string;
  targetLanguageCodes: LanguageClassroomLanguageCode[];
}

const PACKAGE_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const DEFAULT_PROMPT_PATH = join(
  PACKAGE_ROOT,
  'prompts',
  'script-system-prompt.txt',
);

function resolvePromptPath(): string {
  const envPath = process.env['SCRIPT_PROMPT_PATH'];
  if (!envPath) return DEFAULT_PROMPT_PATH;
  return isAbsolute(envPath) ? envPath : resolve(PACKAGE_ROOT, envPath);
}

let cachedSystemPrompt: string | null = null;
function getSystemPrompt(): string {
  if (cachedSystemPrompt !== null) return cachedSystemPrompt;
  const promptPath = resolvePromptPath();
  try {
    cachedSystemPrompt = readFileSync(promptPath, 'utf8');
    return cachedSystemPrompt;
  } catch (err) {
    throw new Error(
      `Prompt file not found at ${promptPath}. Set SCRIPT_PROMPT_PATH or place the file at <repo-root>/prompts/script-system-prompt.txt. Original error: ${(err as Error).message}`,
    );
  }
}

export function buildUserMessage(title: string, text: string): string {
  return `標題：${title}\n\n內容：\n${text}`;
}

function getOpenRouterConfig(): {
  openai: OpenAI;
  model: string;
  thinkingModel: string | null;
} {
  const apiKey = process.env['OPENROUTER_API_KEY'];
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not set');
  }

  const baseURL =
    process.env['OPENROUTER_BASE_URL'] || 'https://openrouter.ai/api/v1';
  const model =
    process.env['LLM_MODEL'] || 'anthropic/claude-3-5-sonnet-20241022';
  const thinkingModel = process.env['LLM_THINKING_MODEL'] || null;

  const openai = new OpenAI({
    apiKey,
    baseURL,
  });

  return { openai, model, thinkingModel };
}

type OpenRouterParams = OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & {
  extra_body?: {
    thinking?: { type: 'optimized'; model: string };
    usage?: { include: boolean };
  };
};

function withThinkingModel(
  params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
  thinkingModel: string | null,
): OpenRouterParams {
  const extraBody: NonNullable<OpenRouterParams['extra_body']> = {
    usage: { include: true },
  };
  if (thinkingModel) {
    extraBody.thinking = { type: 'optimized', model: thinkingModel };
  }

  return {
    ...params,
    extra_body: extraBody,
  };
}

function completionMetadata(
  completion: OpenAI.Chat.ChatCompletion & { provider?: string | null },
  fallbackModel: string,
  thinkingModel: string | null,
): Pick<ScriptResult, 'model' | 'thinkingModel' | 'provider' | 'costUsd'> {
  const usage = completion.usage as { cost?: unknown } | undefined;
  const costUsd = typeof usage?.cost === 'number' ? usage.cost : 0;

  return {
    model: completion.model || fallbackModel,
    thinkingModel,
    provider: completion.provider || 'unknown',
    costUsd,
  };
}

export async function generateScriptWithLLM(
  title: string,
  text: string,
): Promise<ScriptResult> {
  const { openai, model, thinkingModel } = getOpenRouterConfig();
  const system = getSystemPrompt();
  const user = buildUserMessage(title, text);

  const params = withThinkingModel(
    {
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.7,
    },
    thinkingModel,
  );

  const completion = (await openai.chat.completions.create(
    params,
  )) as OpenAI.Chat.ChatCompletion & {
    provider?: string | null;
  };

  const script = completion.choices[0]?.message?.content || '';

  return { script, ...completionMetadata(completion, model, thinkingModel) };
}

export function buildLanguageClassroomUserMessage(
  input: LanguageClassroomInput,
): string {
  return [
    `主語言：${input.sourceLanguageCode}`,
    `目標語言：${input.targetLanguageCodes.join(', ')}`,
    `標題：${input.title}`,
    '',
    '文章內容：',
    input.articleText,
    '',
    'Podcast 講稿：',
    input.script,
  ].join('\n');
}

export async function extractUnifiedKeywords(
  title: string,
  articleText: string,
  script: string,
  sourceLanguageCode: string,
): Promise<UnifiedKeywordsResult> {
  const { openai, model, thinkingModel } = getOpenRouterConfig();
  const completion = (await openai.chat.completions.create(
    withThinkingModel(
      {
        model,
        messages: [
          {
            role: 'system',
            content: unifiedKeywordsSystemPrompt(sourceLanguageCode),
          },
          {
            role: 'user',
            content: buildUnifiedKeywordsUserMessage(
              title,
              articleText,
              script,
            ),
          },
        ],
        temperature: 0.2,
      },
      thinkingModel,
    ),
  )) as OpenAI.Chat.ChatCompletion & {
    provider?: string | null;
  };

  const content = completion.choices[0]?.message?.content || '';
  const keywords = parseUnifiedKeywords(content);

  return {
    keywords,
    ...completionMetadata(completion, model, thinkingModel),
  };
}

export async function generateLanguageClassroomsWithLLM(
  input: LanguageClassroomInput,
  unifiedKeywords: string[],
): Promise<LanguageClassroomResult> {
  const { openai, model, thinkingModel } = getOpenRouterConfig();
  const completion = (await openai.chat.completions.create(
    withThinkingModel(
      {
        model,
        messages: [
          {
            role: 'system',
            content: languageClassroomSystemPrompt(
              input.sourceLanguageCode,
              unifiedKeywords,
            ),
          },
          { role: 'user', content: buildLanguageClassroomUserMessage(input) },
        ],
        temperature: 0.4,
      },
      thinkingModel,
    ),
  )) as OpenAI.Chat.ChatCompletion & {
    provider?: string | null;
  };

  const content = completion.choices[0]?.message?.content || '';
  const lessons = parseLanguageClassroomLessons(
    content,
    input.sourceLanguageCode,
    input.targetLanguageCodes,
    unifiedKeywords,
  );

  return {
    lessons,
    ...completionMetadata(completion, model, thinkingModel),
  };
}

function unifiedKeywordsSystemPrompt(sourceLanguageCode: string): string {
  return `你是語言小教室的關鍵詞編輯。請根據文章標題、文章內容和 Podcast 講稿，為 ${sourceLanguageCode} 使用者挑選 3 到 5 個最適合跨語言教學的核心關鍵詞。

請只輸出有效 JSON，不要 Markdown，不要註解。格式：
{
  "keywords": ["關鍵詞一", "關鍵詞二", "關鍵詞三"]
}

規則：
- keywords 必須是 3 到 5 個字串。
- 每個 keyword 都要是非空白字串。
- keywords 使用主語言 ${sourceLanguageCode}。
- 選擇能代表文章主題、且適合翻譯成其他語言教學的詞。`;
}

function buildUnifiedKeywordsUserMessage(
  title: string,
  articleText: string,
  script: string,
): string {
  return [
    `標題：${title}`,
    '',
    '文章內容：',
    articleText,
    '',
    'Podcast 講稿：',
    script,
  ].join('\n');
}

function languageClassroomSystemPrompt(
  sourceLanguageCode: string,
  unifiedKeywords: string[],
): string {
  const keywordList = unifiedKeywords
    .map((keyword, index) => `${index + 1}. ${keyword}`)
    .join('\n');

  return `你是語言小教室編輯。請根據文章標題為 ${sourceLanguageCode} 使用者產生外語學習卡片。

工作流程：
1. 先把原始文章標題直接翻譯成目標語言，作為 oneLiner。
2. 依照下方統一關鍵詞的順序，為每個目標語言產生對應的目標語言 term。

統一關鍵詞：
${keywordList}

請只輸出有效 JSON，不要 Markdown，不要註解。格式：
{
  "lessons": [
    {
      "targetLanguageCode": "ja",
      "oneLiner": "原文標題在目標語言的直譯",
      "keywords": [
        {
          "term": "出現在 oneLiner 中的關鍵字",
          "reading": "日文假名讀音；英文請用 null",
          "meaning": "用主語言解釋意思",
          "note": "用主語言給初學者的簡短提醒；沒有就 null"
        }
      ]
    }
  ]
}

規則：
- 每個 targetLanguageCode 都要回傳一筆 lesson。
- oneLiner 必須是原始文章標題在目標語言的直譯，盡量保留原意，不要自行擴寫成描述句。
- 每個 lesson 的 keywords 數量必須剛好是 ${unifiedKeywords.length} 個，且順序必須對應統一關鍵詞。
- keywords.term 必須使用目標語言，並對應同一 index 的統一關鍵詞；盡量使用 oneLiner 中的子字串或主要詞彙。
- 同一個 index 在所有目標語言中的 meaning 必須完全相同。
- meaning 和 note 一律使用主語言 ${sourceLanguageCode}。
- reading: targetLanguageCode === 'ja' 時填假名讀音；其他語言一律 null。
- 不要翻完整篇文章，只做標題的直譯與其中的重點單字。`;
}

function parseLanguageClassroomLessons(
  content: string,
  sourceLanguageCode: string,
  targetLanguageCodes: LanguageClassroomLanguageCode[],
  unifiedKeywords: string[],
): LanguageClassroomLesson[] {
  const payload = parseJsonObject(content, 'Language classroom response');
  const rawLessons = Array.isArray(payload['lessons'])
    ? payload['lessons']
    : [];
  const lessons = rawLessons
    .map((raw) =>
      normalizeLanguageClassroomLesson(raw, {
        sourceLanguageCode,
        requireKeywords: true,
        maxKeywords: 5,
      }),
    )
    .filter((lesson): lesson is LanguageClassroomLesson => lesson !== null)
    .filter((lesson) =>
      targetLanguageCodes.includes(
        lesson.targetLanguageCode as LanguageClassroomLanguageCode,
      ),
    );

  const byTargetLanguage = new Map(
    lessons.map((lesson) => [lesson.targetLanguageCode, lesson]),
  );
  const ordered = targetLanguageCodes
    .map((targetLanguageCode) => byTargetLanguage.get(targetLanguageCode))
    .filter(
      (lesson): lesson is LanguageClassroomLesson => lesson !== undefined,
    );

  if (ordered.length === 0) {
    throw new Error(
      'Language classroom response did not contain any valid lessons',
    );
  }

  validateLanguageClassroomKeywordAlignment(ordered, unifiedKeywords);

  return ordered;
}

function parseUnifiedKeywords(content: string): string[] {
  const payload = parseJsonObject(content, 'Unified keywords response');
  const rawKeywords = payload['keywords'];

  if (!Array.isArray(rawKeywords)) {
    throw new Error('Unified keywords response missing "keywords" array');
  }

  const keywords = rawKeywords.map((rawKeyword, index) => {
    if (typeof rawKeyword !== 'string') {
      throw new Error(`Unified keyword at index ${index} must be a string`);
    }

    const keyword = rawKeyword.trim();
    if (!keyword) {
      throw new Error(`Unified keyword at index ${index} must not be empty`);
    }

    return keyword;
  });

  if (keywords.length < 3 || keywords.length > 5) {
    throw new Error(
      `Unified keywords response must contain 3 to 5 keywords, got ${keywords.length}`,
    );
  }

  return keywords;
}

function validateLanguageClassroomKeywordAlignment(
  lessons: LanguageClassroomLesson[],
  unifiedKeywords: string[],
): void {
  for (const lesson of lessons) {
    if (lesson.keywords.length !== unifiedKeywords.length) {
      throw new Error(
        `Lesson for ${lesson.targetLanguageCode} has ${lesson.keywords.length} keywords, expected ${unifiedKeywords.length}`,
      );
    }
  }

  const firstLesson = lessons[0];
  if (!firstLesson) return;

  for (let index = 0; index < unifiedKeywords.length; index += 1) {
    const expectedMeaning = firstLesson.keywords[index]?.meaning;
    const mismatchedLesson = lessons.find(
      (lesson) => lesson.keywords[index]?.meaning !== expectedMeaning,
    );

    if (mismatchedLesson) {
      throw new Error(
        `Keyword at index ${index} has inconsistent "meaning" across languages`,
      );
    }
  }
}

function parseJsonObject(
  content: string,
  context: string,
): Record<string, unknown> {
  const trimmed = content.trim();
  const rawJson = stripJsonFence(trimmed);
  const parsed = JSON.parse(rawJson) as unknown;

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${context} must be a JSON object`);
  }

  return parsed as Record<string, unknown>;
}

function stripJsonFence(trimmed: string): string {
  if (!trimmed.startsWith('```')) return trimmed;

  const firstLineEnd = trimmed.indexOf('\n');
  const closingFenceStart = trimmed.lastIndexOf('```');
  if (firstLineEnd < 0 || closingFenceStart <= firstLineEnd) return trimmed;

  const fenceLanguage = trimmed.slice(3, firstLineEnd).trim().toLowerCase();
  if (fenceLanguage && fenceLanguage !== 'json') return trimmed;

  if (trimmed.slice(closingFenceStart + 3).trim()) return trimmed;

  return trimmed.slice(firstLineEnd + 1, closingFenceStart).trim();
}
