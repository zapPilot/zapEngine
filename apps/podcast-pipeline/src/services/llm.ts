import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import OpenAI from 'openai';

import { getRequiredEnv } from '../lib/env.js';
import { errorMessage } from '../lib/errorMessage.js';
import { normalizeLanguageClassroomLessonDraft } from '../lib/languageClassroom.js';
import { sleep } from '../lib/sleep.js';
import type {
  LanguageClassroomLanguageCode,
  LanguageClassroomLessonDraft,
} from '../types.js';
import { logIngestEvent } from './ingest/step.js';
import { convertTextToZhTW } from './opencc.js';
import { combineAbortSignalWithTimeout } from './video/abort.js';

export interface ScriptResult {
  title: string | null;
  script: string;
  model: string;
  thinkingModel: string | null;
  provider: string;
  costUsd: number;
}

export interface LanguageClassroomResult {
  lessons: LanguageClassroomLessonDraft[];
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
const LLM_COMPLETION_MAX_ATTEMPTS = 2;
const LLM_COMPLETION_RETRY_DELAY_MS = 2_000;
const SCRIPT_PAYLOAD_MAX_ATTEMPTS = 2;
const RETRYABLE_OPENROUTER_STATUS = new Set([408, 409, 429]);

type ScriptTitleFallbackReason =
  | 'invalid_title'
  | 'missing_title'
  | 'plain_text_response';

interface ParsedScriptPayload {
  title: string | null;
  script: string;
  titleFallbackReason: ScriptTitleFallbackReason | null;
}

class ScriptPayloadValidationError extends Error {
  constructor(
    message: string,
    readonly reason: 'invalid_json' | 'missing_script' | 'packaged_body',
    readonly detail: string | null = null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ScriptPayloadValidationError';
  }
}

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

function buildScriptPayloadRetryMessage(
  title: string,
  text: string,
  error: ScriptPayloadValidationError,
): string {
  const reason = error.detail
    ? `${error.reason}: ${error.detail}`
    : error.reason;
  return `${buildUserMessage(title, text)}\n\n修正要求：上一個回應未符合 JSON 輸出契約（${reason}）。只輸出可解析的 JSON 物件，title 與 script 都必須是非空字串，且 script 只能包含 body，不得自行加入開場招呼、結尾 CTA、Markdown 標題、時間碼或分隔線。`;
}

function generatedScriptBodyViolation(script: string): string | null {
  const body = script.trim();
  const normalizedStart = body.slice(0, 40).toLocaleLowerCase();
  const greetingPrefixes = [
    '各位',
    '大家好',
    '歡迎',
    '哈囉',
    '哈啰',
    '嗨，',
    '嗨,',
    '嗨 ',
    'hello ',
    'hi ',
  ];
  if (greetingPrefixes.some((prefix) => normalizedStart.startsWith(prefix))) {
    return 'opening_greeting';
  }
  const lines = body.split(/\r?\n/u);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (isMarkdownHeading(line)) return 'markdown_heading';
    if (isTimestampLine(line)) return 'timestamp';
    if (isMarkdownSeparator(line)) return 'separator';
  }

  const ending = body.slice(-300).toLocaleLowerCase();
  const ctaLead = [
    '記得',
    '別忘了',
    '歡迎',
    '請',
    '前往',
    '造訪',
    '可以到',
    'remember',
    'please',
    'visit',
  ];
  const ctaAction = [
    '訂閱',
    '按讚',
    '分享',
    '追蹤',
    '留言',
    '官網',
    '網站',
    '下載',
    '註冊',
    '加入',
    'subscribe',
    'like',
    'share',
    'follow',
    'visit our website',
  ];
  if (
    ctaLead.some((phrase) => ending.includes(phrase)) &&
    ctaAction.some((phrase) => ending.includes(phrase))
  ) {
    return 'closing_cta';
  }
  return null;
}

function isMarkdownHeading(line: string): boolean {
  let hashes = 0;
  while (line[hashes] === '#' && hashes < 7) hashes += 1;
  return hashes >= 1 && hashes <= 6 && /\s/u.test(line[hashes] ?? '');
}

function isTimestampLine(line: string): boolean {
  const unwrapped =
    line.startsWith('[') || line.startsWith('(') ? line.slice(1) : line;
  const token = unwrapped.split(/\s/u, 1)[0]?.replace(/[\])]$/u, '') ?? '';
  const parts = token.split(':');
  if (parts.length < 2 || parts.length > 3) return false;
  return parts.every(
    (part, index) =>
      /^\d{1,2}$/u.test(part) &&
      (index === 0 || Number.parseInt(part, 10) < 60),
  );
}

function isMarkdownSeparator(line: string): boolean {
  const marker = line[0];
  return (
    line.length >= 3 &&
    marker !== undefined &&
    '-_*'.includes(marker) &&
    [...line].every((character) => character === marker)
  );
}

function assertGeneratedScriptBody(script: string): void {
  const violation = generatedScriptBodyViolation(script);
  if (violation === null) return;
  throw new ScriptPayloadValidationError(
    `LLM returned a script with application-owned packaging: ${violation}`,
    'packaged_body',
    violation,
  );
}

export function normalizeEditorialTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  let normalized = value.trim();
  const quotePairs: readonly (readonly [string, string])[] = [
    ['"', '"'],
    ["'", "'"],
    ['‘', '’'],
    ['“', '”'],
    ['「', '」'],
    ['『', '』'],
  ];
  let strippedQuotes = true;
  while (strippedQuotes && normalized.length >= 2) {
    strippedQuotes = false;
    for (const [opening, closing] of quotePairs) {
      if (normalized.startsWith(opening) && normalized.endsWith(closing)) {
        normalized = normalized.slice(opening.length, -closing.length).trim();
        strippedQuotes = true;
        break;
      }
    }
  }

  if (
    /[\r\n]/u.test(normalized) ||
    /^(?:#{1,6}(?:\s|$)|[-*+]\s|>\s?|`|[*_]{1,2}\S|~~)/u.test(normalized)
  ) {
    return null;
  }

  const characterCount = [...normalized].length;
  if (characterCount < 4 || characterCount > 60) return null;

  return convertTextToZhTW(normalized);
}

function parseScriptPayload(content: string): ParsedScriptPayload {
  if (!content.trim()) {
    throw new Error('LLM returned empty script content');
  }

  const stripped = stripJsonFence(content.trim());
  if (!stripped.startsWith('{')) {
    assertGeneratedScriptBody(content);
    return {
      title: null,
      script: content,
      titleFallbackReason: 'plain_text_response',
    };
  }

  let payload: Record<string, unknown>;
  try {
    payload = parseJsonObject(stripped, 'Script response');
  } catch (error) {
    throw new ScriptPayloadValidationError(
      'LLM returned invalid script JSON content',
      'invalid_json',
      null,
      { cause: error },
    );
  }

  const script = payload['script'];
  if (typeof script !== 'string' || !script.trim()) {
    throw new ScriptPayloadValidationError(
      'LLM returned empty script content',
      'missing_script',
    );
  }
  assertGeneratedScriptBody(script);

  const rawTitle = payload['title'];
  const title = normalizeEditorialTitle(rawTitle);
  let titleFallbackReason: ScriptTitleFallbackReason | null = null;
  if (title === null) {
    titleFallbackReason =
      typeof rawTitle === 'string' ? 'invalid_title' : 'missing_title';
  }
  return {
    title,
    script,
    titleFallbackReason,
  };
}

export interface OpenRouterConfig {
  openai: OpenAI;
  model: string;
  thinkingModel: string | null;
  timeoutMs: number;
}

export const DEFAULT_OPENROUTER_TIMEOUT_MS = 120_000;
const openRouterClientCache = new Map<string, OpenAI>();

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
  const model = overrides?.model?.trim() || getRequiredEnv('LLM_MODEL');
  const thinkingModel =
    overrides?.thinkingModel !== undefined
      ? overrides.thinkingModel
      : process.env['LLM_THINKING_MODEL'] || null;
  const timeoutMs = getOpenRouterTimeoutMs();
  const clientKey = JSON.stringify([apiKey, baseURL, model, timeoutMs]);
  let openai = openRouterClientCache.get(clientKey);
  if (!openai) {
    openai = new OpenAI({
      apiKey,
      baseURL,
      timeout: timeoutMs,
      maxRetries: 0,
    });
    openRouterClientCache.set(clientKey, openai);
  }

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
  const deadline = combineAbortSignalWithTimeout(
    requestOptions.signal,
    timeoutMs,
    `OpenRouter request timed out after ${timeoutMs}ms`,
  );
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
    deadline.dispose();
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
  if (!error || typeof error !== 'object') {
    return false;
  }

  const status = (error as { status?: unknown }).status;
  if (typeof status === 'number') {
    return RETRYABLE_OPENROUTER_STATUS.has(status) || status >= 500;
  }

  const name = (error as { name?: unknown }).name;
  return (
    name === 'APIConnectionError' ||
    name === 'APITimeoutError' ||
    name === 'TimeoutError'
  );
}

type LLMCompletionOperation = 'generateScript' | 'generateLanguageClassrooms';

async function createCompletionWithRetry(
  openai: OpenAI,
  params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
  thinkingModel: string | null,
  operation: LLMCompletionOperation,
): Promise<OpenRouterChatCompletion> {
  for (let attempt = 1; attempt <= LLM_COMPLETION_MAX_ATTEMPTS; attempt++) {
    try {
      return await createOpenRouterChatCompletion(
        openai,
        params,
        thinkingModel,
      );
    } catch (error) {
      const shouldRetry =
        attempt < LLM_COMPLETION_MAX_ATTEMPTS &&
        isRetryableOpenRouterError(error);
      if (!shouldRetry) {
        throw error;
      }

      logIngestEvent('llm:retry', {
        operation,
        model: params.model,
        attempt,
        nextAttempt: attempt + 1,
        delayMs: LLM_COMPLETION_RETRY_DELAY_MS,
        error: errorMessage(error),
      });
      await sleep(LLM_COMPLETION_RETRY_DELAY_MS);
    }
  }

  throw new Error(`OpenRouter ${operation} retry loop exhausted`);
}

export async function generateScriptWithLLM(
  title: string,
  text: string,
): Promise<ScriptResult> {
  const { openai, model, thinkingModel } = getOpenRouterConfig();
  const system = getSystemPrompt();
  let retryError: ScriptPayloadValidationError | null = null;
  let costUsd = 0;

  for (let attempt = 1; attempt <= SCRIPT_PAYLOAD_MAX_ATTEMPTS; attempt += 1) {
    const completion = await createCompletionWithRetry(
      openai,
      {
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content:
              retryError === null
                ? buildUserMessage(title, text)
                : buildScriptPayloadRetryMessage(title, text, retryError),
          },
        ],
        temperature: 0.7,
      },
      thinkingModel,
      'generateScript',
    );

    const metadata = completionMetadata(completion, model, thinkingModel);
    costUsd += metadata.costUsd;
    const content = completion.choices[0]?.message?.content || '';
    try {
      const parsed = parseScriptPayload(content);
      if (parsed.titleFallbackReason !== null) {
        logIngestEvent('llm:title-fallback', {
          reason: parsed.titleFallbackReason,
        });
      }
      return {
        title: parsed.title,
        script: parsed.script,
        ...metadata,
        costUsd,
      };
    } catch (error) {
      if (
        !(error instanceof ScriptPayloadValidationError) ||
        attempt === SCRIPT_PAYLOAD_MAX_ATTEMPTS
      ) {
        throw error;
      }
      retryError = error;
    }
  }

  throw new Error('OpenRouter script payload retry loop exhausted');
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
  const completion = await createCompletionWithRetry(
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
    'generateLanguageClassrooms',
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
  return `你是語言小教室編輯。請閱讀文章內容與 Podcast 講稿，為 ${sourceLanguageCode} 使用者挑選本集最值得學的外語詞彙，並產生外語學習卡片與一段目標語言講稿。

工作流程：
1. 先用 ${sourceLanguageCode} 通讀文章與講稿，選出 3 到 5 個本集最核心、最實用的概念詞彙。優先挑本集主題的財經／加密貨幣關鍵概念；避免虛詞、寒暄語，以及過度在地、換個語言就失去意義的專有名詞。這一組概念是所有目標語言共用的。
2. oneLiner 是原始文章標題在目標語言的直譯，只當作開場句，不是選詞的依據。
3. 對每個 targetLanguageCode，用「同一組概念」產生 keywords：term 是該概念在目標語言的實際說法，meaning／note 用 ${sourceLanguageCode} 解釋。各語言的 lesson 必須對應同一組概念、同樣的數量與順序。
4. 對每個 targetLanguageCode，再用同一組概念寫一段 script：約 1.5 到 3 分鐘的口語旁白（日文約 500 到 900 字，英文約 220 到 450 words），內容必須根據文章與講稿，逐一講解這堂課選出的每個概念，用自然口語呈現，不是逐字翻譯 oneLiner 或 keywords。

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
      ],
      "script": "整堂課的口語旁白，一律只使用目標語言"
    }
  ]
}

規則：
- 每個 targetLanguageCode 都要回傳一筆 lesson。
- keywords 從文章與講稿選出的核心概念而來，不必來自 oneLiner 或標題；重點是實用、能帶著走的外語詞彙。
- 所有目標語言共用同一組概念：每個 lesson 的 keywords 數量、順序、對應的概念都必須一致。
- oneLiner 是標題的直譯，盡量保留原意，不要自行擴寫成描述句。
- meaning 和 note 一律使用主語言 ${sourceLanguageCode}。
- reading: targetLanguageCode === 'ja' 時填假名讀音；其他語言一律 null。
- script 一律只使用目標語言，不可混入 ${sourceLanguageCode} 或其他語言，也不可包含 Markdown 或條列符號，要寫成適合朗讀的自然口語段落。
- script 內容必須根據文章與講稿，涵蓋這堂課選出的每一個 keyword 概念，不能只根據標題或 oneLiner 隨意發揮。`;
}

function parseLanguageClassroomLessons(
  content: string,
  sourceLanguageCode: string,
  targetLanguageCodes: LanguageClassroomLanguageCode[],
): LanguageClassroomLessonDraft[] {
  const payload = parseJsonObject(content, 'Language classroom response');
  const rawLessons = Array.isArray(payload['lessons'])
    ? payload['lessons']
    : [];
  const lessons = rawLessons
    .map((raw) =>
      normalizeLanguageClassroomLessonDraft(raw, {
        sourceLanguageCode,
        requireKeywords: true,
        maxKeywords: 5,
      }),
    )
    .filter((lesson): lesson is LanguageClassroomLessonDraft => lesson !== null)
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
      (lesson): lesson is LanguageClassroomLessonDraft => lesson !== undefined,
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
