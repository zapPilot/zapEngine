import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import OpenAI from 'openai';

import { errorMessage } from '../lib/errorMessage.js';
import { normalizeLanguageClassroomLesson } from '../lib/languageClassroom.js';
import type {
  LanguageClassroomLanguageCode,
  LanguageClassroomLesson,
} from '../types.js';
import { logIngestEvent } from './ingest/step.js';

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
const SCRIPT_GENERATION_MAX_ATTEMPTS = 2;
const SCRIPT_GENERATION_RETRY_DELAY_MS = 2_000;
const RETRYABLE_OPENROUTER_STATUS = new Set([408, 409, 429]);

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

export interface OpenRouterConfig {
  openai: OpenAI;
  model: string;
  thinkingModel: string | null;
  timeoutMs: number;
}

export const DEFAULT_OPENROUTER_TIMEOUT_MS = 120_000;

export function getOpenRouterTimeoutMs(
  value: string | undefined = process.env['OPENROUTER_TIMEOUT_MS'],
): number {
  const timeoutMs = Number(value);
  return Number.isSafeInteger(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : DEFAULT_OPENROUTER_TIMEOUT_MS;
}

export function getOpenRouterConfig(overrides?: {
  model?: string;
  thinkingModel?: string | null;
}): OpenRouterConfig {
  const apiKey = process.env['OPENROUTER_API_KEY'];
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not set');
  }

  const baseURL =
    process.env['OPENROUTER_BASE_URL'] || 'https://openrouter.ai/api/v1';
  const model =
    overrides?.model ||
    process.env['LLM_MODEL'] ||
    'anthropic/claude-3-5-sonnet-20241022';
  const thinkingModel =
    overrides?.thinkingModel !== undefined
      ? overrides.thinkingModel
      : process.env['LLM_THINKING_MODEL'] || null;
  const timeoutMs = getOpenRouterTimeoutMs();

  const openai = new OpenAI({
    apiKey,
    baseURL,
    timeout: timeoutMs,
    maxRetries: 0,
  });

  return { openai, model, thinkingModel, timeoutMs };
}

export type OpenRouterParams =
  OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & {
    extra_body?: {
      thinking?: { type: 'optimized'; model: string };
      usage?: { include: boolean };
    };
  };

export function withThinkingModel(
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

export type OpenRouterChatCompletion = OpenAI.Chat.ChatCompletion & {
  provider?: string | null;
};

export interface OpenRouterRequestOptions {
  signal?: AbortSignal;
}

interface OpenRouterDeadline {
  signal: AbortSignal;
  cleanup: () => void;
}

class OpenRouterTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`OpenRouter request timed out after ${timeoutMs}ms`);
    this.name = 'OpenRouterTimeoutError';
  }
}

function createOpenRouterDeadline(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number,
): OpenRouterDeadline {
  const controller = new AbortController();
  const abortFromExternalSignal = (): void => {
    controller.abort(externalSignal?.reason);
  };

  if (externalSignal?.aborted) {
    abortFromExternalSignal();
  } else {
    externalSignal?.addEventListener('abort', abortFromExternalSignal, {
      once: true,
    });
  }

  const timeout = setTimeout(() => {
    controller.abort(new OpenRouterTimeoutError(timeoutMs));
  }, timeoutMs);
  timeout.unref();

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abortFromExternalSignal);
    },
  };
}

export async function createOpenRouterChatCompletion(
  openai: OpenAI,
  params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
  thinkingModel: string | null,
  requestOptions: OpenRouterRequestOptions = {},
): Promise<OpenRouterChatCompletion> {
  const inputChars = userInputCharacterCount(params.messages);
  const timeoutMs = getOpenRouterTimeoutMs();
  logIngestEvent('llm:request', {
    model: params.model,
    thinking: Boolean(thinkingModel),
    inputChars,
    timeoutMs,
  });

  const request = withThinkingModel(params, thinkingModel);
  const deadline = createOpenRouterDeadline(requestOptions.signal, timeoutMs);
  let completion: OpenRouterChatCompletion;
  try {
    completion = await openai.chat.completions.create(request, {
      signal: deadline.signal,
    });
  } catch (error) {
    const abortReason = deadline.signal.reason;
    if (deadline.signal.aborted && abortReason instanceof Error) {
      throw abortReason;
    }
    throw error;
  } finally {
    deadline.cleanup();
  }
  const metadata = completionMetadata(completion, params.model, thinkingModel);
  logIngestEvent('llm:response', {
    model: metadata.model,
    thinking: Boolean(thinkingModel),
    inputChars,
    timeoutMs,
    provider: metadata.provider,
    costUsd: metadata.costUsd,
    outputChars: completionOutputCharacterCount(completion),
  });

  return completion;
}

function userInputCharacterCount(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
): number {
  return messages.reduce(
    (total, message) =>
      message.role === 'user'
        ? total + messageContentCharacterCount(message.content)
        : total,
    0,
  );
}

function completionOutputCharacterCount(
  completion: OpenRouterChatCompletion,
): number {
  return completion.choices.reduce(
    (total, choice) =>
      total + messageContentCharacterCount(choice.message.content),
    0,
  );
}

function messageContentCharacterCount(content: unknown): number {
  if (typeof content === 'string') return content.length;
  if (!Array.isArray(content)) return 0;

  const contentParts = content as unknown[];
  return contentParts.reduce<number>((total, part) => {
    if (!part || typeof part !== 'object') return total;
    const text = (part as { text?: unknown }).text;
    return total + (typeof text === 'string' ? text.length : 0);
  }, 0);
}

export function completionMetadata(
  completion: OpenRouterChatCompletion,
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

function isRetryableOpenRouterError(error: unknown): boolean {
  if (error instanceof OpenRouterTimeoutError) {
    return true;
  }
  if (!error || typeof error !== 'object') {
    return false;
  }

  const status = (error as { status?: unknown }).status;
  if (typeof status === 'number') {
    return RETRYABLE_OPENROUTER_STATUS.has(status) || status >= 500;
  }

  const name = (error as { name?: unknown }).name;
  return name === 'APIConnectionError' || name === 'APITimeoutError';
}

async function waitForScriptRetry(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, SCRIPT_GENERATION_RETRY_DELAY_MS);
  });
}

async function createScriptCompletionWithRetry(
  openai: OpenAI,
  params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
  thinkingModel: string | null,
): Promise<OpenRouterChatCompletion> {
  for (let attempt = 1; attempt <= SCRIPT_GENERATION_MAX_ATTEMPTS; attempt++) {
    try {
      return await createOpenRouterChatCompletion(
        openai,
        params,
        thinkingModel,
      );
    } catch (error) {
      const shouldRetry =
        attempt < SCRIPT_GENERATION_MAX_ATTEMPTS &&
        isRetryableOpenRouterError(error);
      if (!shouldRetry) {
        throw error;
      }

      logIngestEvent('llm:retry', {
        operation: 'generateScript',
        model: params.model,
        attempt,
        nextAttempt: attempt + 1,
        delayMs: SCRIPT_GENERATION_RETRY_DELAY_MS,
        error: errorMessage(error),
      });
      await waitForScriptRetry();
    }
  }

  throw new Error('OpenRouter script generation retry loop exhausted');
}

export async function generateScriptWithLLM(
  title: string,
  text: string,
): Promise<ScriptResult> {
  const { openai, model, thinkingModel } = getOpenRouterConfig();
  const system = getSystemPrompt();
  const user = buildUserMessage(title, text);

  const completion = await createScriptCompletionWithRetry(
    openai,
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

  const script = completion.choices[0]?.message?.content || '';
  if (!script.trim()) {
    throw new Error('LLM returned empty script content');
  }

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
  const completion = await createOpenRouterChatCompletion(
    openai,
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
  );

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
  return `你是語言小教室編輯。請閱讀文章內容與 Podcast 講稿，為 ${sourceLanguageCode} 使用者挑選本集最值得學的外語詞彙，並產生外語學習卡片。

工作流程：
1. 先用 ${sourceLanguageCode} 通讀文章與講稿，選出 3 到 5 個本集最核心、最實用的概念詞彙。優先挑本集主題的財經／加密貨幣關鍵概念；避免虛詞、寒暄語，以及過度在地、換個語言就失去意義的專有名詞。這一組概念是所有目標語言共用的。
2. oneLiner 是原始文章標題在目標語言的直譯，只當作開場句，不是選詞的依據。
3. 對每個 targetLanguageCode，用「同一組概念」產生 keywords：term 是該概念在目標語言的實際說法，meaning／note 用 ${sourceLanguageCode} 解釋。各語言的 lesson 必須對應同一組概念、同樣的數量與順序。

請只輸出有效 JSON，不要 Markdown，不要註解。格式：
{
  "lessons": [
    {
      "targetLanguageCode": "ja",
      "oneLiner": "原文標題在目標語言的直譯",
      "keywords": [
        {
          "term": "核心概念在目標語言的實際說法",
          "reading": "日文假名讀音；英文請用 null",
          "meaning": "用主語言解釋這個概念的意思",
          "note": "用主語言給初學者的簡短提醒；沒有就 null"
        }
      ]
    }
  ]
}

規則：
- 每個 targetLanguageCode 都要回傳一筆 lesson。
- keywords 從文章與講稿選出的核心概念而來，不必來自 oneLiner 或標題；重點是實用、能帶著走的外語詞彙。
- 所有目標語言共用同一組概念：每個 lesson 的 keywords 數量、順序、對應的概念都必須一致。
- oneLiner 是標題的直譯，盡量保留原意，不要自行擴寫成描述句。
- meaning 和 note 一律使用主語言 ${sourceLanguageCode}。
- reading: targetLanguageCode === 'ja' 時填假名讀音；其他語言一律 null。`;
}

function parseLanguageClassroomLessons(
  content: string,
  sourceLanguageCode: string,
  targetLanguageCodes: LanguageClassroomLanguageCode[],
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

  return ordered;
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

export function stripJsonFence(trimmed: string): string {
  if (!trimmed.startsWith('```')) return trimmed;

  const firstLineEnd = trimmed.indexOf('\n');
  const closingFenceStart = trimmed.lastIndexOf('```');
  if (firstLineEnd < 0 || closingFenceStart <= firstLineEnd) return trimmed;

  const fenceLanguage = trimmed.slice(3, firstLineEnd).trim().toLowerCase();
  if (fenceLanguage && fenceLanguage !== 'json') return trimmed;

  if (trimmed.slice(closingFenceStart + 3).trim()) return trimmed;

  return trimmed.slice(firstLineEnd + 1, closingFenceStart).trim();
}
