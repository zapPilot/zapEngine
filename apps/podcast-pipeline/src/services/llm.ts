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
}

export interface LanguageClassroomResult {
  lessons: LanguageClassroomLesson[];
  model: string;
  thinkingModel: string | null;
  provider: string;
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
  };
};

function withThinkingModel(
  params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
  thinkingModel: string | null,
): OpenRouterParams {
  return {
    ...params,
    ...(thinkingModel && {
      extra_body: { thinking: { type: 'optimized', model: thinkingModel } },
    }),
  };
}

function completionMetadata(
  completion: OpenAI.Chat.ChatCompletion & { provider?: string | null },
  fallbackModel: string,
  thinkingModel: string | null,
): Pick<ScriptResult, 'model' | 'thinkingModel' | 'provider'> {
  return {
    model: completion.model || fallbackModel,
    thinkingModel,
    provider: completion.provider || 'unknown',
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

export async function generateLanguageClassroomsWithLLM(
  input: LanguageClassroomInput,
): Promise<LanguageClassroomResult> {
  const { openai, model, thinkingModel } = getOpenRouterConfig();
  const completion = (await openai.chat.completions.create(
    withThinkingModel(
      {
        model,
        messages: [
          {
            role: 'system',
            content: languageClassroomSystemPrompt(input.sourceLanguageCode),
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
  );

  return {
    lessons,
    ...completionMetadata(completion, model, thinkingModel),
  };
}

function languageClassroomSystemPrompt(sourceLanguageCode: string): string {
  return `你是語言小教室編輯。請根據文章產生給 ${sourceLanguageCode} 使用者的外語學習卡片。

請只輸出有效 JSON，不要 Markdown，不要註解。格式：
{
  "lessons": [
    {
      "targetLanguageCode": "ja",
      "oneLiner": "用目標語言寫一句可用來介紹整篇文章的話。",
      "keywords": [
        {
          "term": "目標語言單字",
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
- oneLiner 必須使用目標語言，最多 140 字元。
- keywords 選 3 到 5 個最能理解文章的詞，term 必須使用目標語言。
- meaning 和 note 使用主語言 ${sourceLanguageCode}。
- 不要翻完整篇文章，只做一句話和重點單字。`;
}

function parseLanguageClassroomLessons(
  content: string,
  sourceLanguageCode: string,
  targetLanguageCodes: LanguageClassroomLanguageCode[],
): LanguageClassroomLesson[] {
  const payload = parseJsonObject(content);
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

  return ordered;
}

function parseJsonObject(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  const rawJson = stripJsonFence(trimmed);
  const parsed = JSON.parse(rawJson) as unknown;

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Language classroom response must be a JSON object');
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
