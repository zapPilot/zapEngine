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
import {
  type LogDetails,
  logIngestEvent,
  logPipelineEvent,
} from './ingest/step.js';
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
/**
 * One response carries a lesson per target language, each with a 1.5-3 minute
 * narration script, so the real output sits around 3-4k tokens. The cap is what
 * makes a degenerate provider truncate instead of generating until the request
 * deadline: several endpoints for the configured model advertise a completion
 * limit in the hundreds of thousands of tokens.
 */
const LANGUAGE_CLASSROOM_MAX_TOKENS = 8_000;
/** Selecting concepts and writing narration, not a reasoning task. */
const LANGUAGE_CLASSROOM_REASONING: OpenRouterReasoning = { enabled: false };
const SCRIPT_PAYLOAD_MAX_ATTEMPTS = 2;
/**
 * The one workload the shared ceiling is wrong for. The script prompt forbids
 * summarizing, permits an output longer than its input, and sets no token cap,
 * so a 13k-character article legitimately generates for minutes -- the 120s
 * default killed those runs while the model was still working correctly. Every
 * other workload keeps the shared deadline.
 */
const SCRIPT_OPENROUTER_TIMEOUT_MS = 600_000;
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

export interface OpenRouterProviderRouting {
  sort?: 'price' | 'throughput' | 'latency';
  require_parameters?: boolean;
  quantizations?: string[];
}

export interface OpenRouterReasoning {
  enabled?: boolean;
  effort?: 'minimal' | 'low' | 'medium' | 'high';
}

/**
 * Left unset, OpenRouter load-balances on price, and the cheapest endpoints for
 * a slug can be fp4-quantized or degraded ones that never return inside the
 * request deadline. `require_parameters` additionally keeps the request away
 * from endpoints that would accept but silently ignore `response_format` or
 * `reasoning`.
 *
 * A `quantizations` allowlist is the next escalation, but it is deliberately
 * not set here: it would also drop every endpoint whose quantization OpenRouter
 * reports as unknown, which includes DeepSeek's own first-party endpoint.
 */
const OPENROUTER_PROVIDER_ROUTING: OpenRouterProviderRouting = {
  sort: 'throughput',
  require_parameters: true,
};

/**
 * Dropping `sort` is the whole point of the script fallback: the throughput
 * sort is deterministic, so re-sending an identical request would be handed
 * straight back to the endpoint that just refused it. Without it OpenRouter
 * load-balances the retry itself, while `require_parameters` still keeps
 * `response_format` honoured.
 */
export const OPENROUTER_FALLBACK_ROUTING: OpenRouterProviderRouting = {
  require_parameters: true,
};

export type OpenRouterParams =
  OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & {
    usage?: { include: boolean };
    provider?: OpenRouterProviderRouting;
    reasoning?: OpenRouterReasoning;
  };

/**
 * OpenRouter reads these alongside `model` and `messages` at the top level of
 * the request body. They used to travel inside an `extra_body` wrapper, which
 * is the Python SDK's client-side kwarg: that SDK flattens it into the body
 * before the request leaves the process, so a literal `extra_body` key never
 * reaches OpenRouter and everything inside it was dropped.
 */
export function withOpenRouterOptions(
  params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
  reasoning?: OpenRouterReasoning,
  providerRouting: OpenRouterProviderRouting = OPENROUTER_PROVIDER_ROUTING,
): OpenRouterParams {
  return {
    ...params,
    usage: { include: true },
    provider: providerRouting,
    ...(reasoning ? { reasoning } : {}),
  };
}

function routingLabel(routing: OpenRouterProviderRouting): string {
  return routing.sort ?? 'default';
}

function reasoningLabel(reasoning: OpenRouterReasoning | undefined): string {
  if (!reasoning) return 'provider-default';
  if (reasoning.enabled === false) return 'disabled';
  return reasoning.effort ? `effort:${reasoning.effort}` : 'enabled';
}

export type OpenRouterChatCompletion = OpenAI.Chat.ChatCompletion & {
  provider?: string | null;
};

export interface OpenRouterRequestOptions {
  signal?: AbortSignal;
  reasoning?: OpenRouterReasoning;
  /** Overrides the shared deadline for a workload whose output is long-form. */
  timeoutMs?: number;
  /** Overrides endpoint selection; used by the script fallback. */
  providerRouting?: OpenRouterProviderRouting;
  logContext?: {
    prefix: string;
    details?: LogDetails;
  };
}

function logOpenRouterEvent(
  event: string,
  details: LogDetails,
  logContext: OpenRouterRequestOptions['logContext'],
): void {
  if (logContext) {
    logPipelineEvent(logContext.prefix, event, {
      ...(logContext.details ?? {}),
      ...details,
    });
    return;
  }
  logIngestEvent(event, details);
}

export async function createOpenRouterChatCompletion(
  openai: OpenAI,
  params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
  thinkingModel: string | null,
  requestOptions: OpenRouterRequestOptions = {},
): Promise<OpenRouterChatCompletion> {
  const inputChars = userInputCharacterCount(params.messages);
  const timeoutMs = requestOptions.timeoutMs ?? getOpenRouterTimeoutMs();
  const reasoning = reasoningLabel(requestOptions.reasoning);
  const routing = requestOptions.providerRouting ?? OPENROUTER_PROVIDER_ROUTING;
  // Explicit 'unset' rather than an omitted field: an absent output ceiling is
  // exactly the condition worth spotting on the failure line.
  const maxTokens = params.max_tokens ?? 'unset';
  logOpenRouterEvent(
    'llm:request',
    {
      model: params.model,
      thinking: Boolean(thinkingModel),
      inputChars,
      timeoutMs,
      maxTokens,
      reasoning,
    },
    requestOptions.logContext,
  );

  const request = withOpenRouterOptions(
    params,
    requestOptions.reasoning,
    routing,
  );
  const deadline = combineAbortSignalWithTimeout(
    requestOptions.signal,
    timeoutMs,
    `OpenRouter request timed out after ${timeoutMs}ms`,
  );
  let completion: OpenRouterChatCompletion;
  try {
    // The SDK carries its own timeout alongside our AbortSignal, and the
    // cached client was built with the shared 120s one. Overriding it per
    // request is what lets a longer per-workload deadline actually apply
    // without minting a second client for every distinct timeout.
    completion = await openai.chat.completions.create(request, {
      signal: deadline.signal,
      timeout: timeoutMs,
    });
  } catch (error) {
    const abortReason = deadline.signal.reason;
    const failure =
      deadline.signal.aborted && abortReason instanceof Error
        ? abortReason
        : error;
    // `llm:response` is the only line carrying the provider, and it fires only
    // on success -- a timeout otherwise left no record of what was requested.
    logOpenRouterEvent(
      'llm:failed',
      {
        model: params.model,
        inputChars,
        timeoutMs,
        maxTokens,
        reasoning,
        routing: routingLabel(routing),
        error: errorMessage(failure),
      },
      requestOptions.logContext,
    );
    throw failure;
  } finally {
    deadline.dispose();
  }
  const metadata = completionMetadata(completion, params.model, thinkingModel);
  logOpenRouterEvent(
    'llm:response',
    {
      model: metadata.model,
      thinking: Boolean(thinkingModel),
      inputChars,
      timeoutMs,
      provider: metadata.provider,
      costUsd: metadata.costUsd,
      outputChars: completionOutputCharacterCount(completion),
    },
    requestOptions.logContext,
  );

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

/**
 * Transport-level failures worth one more attempt. Shared with translation so a
 * single OpenRouter retry policy covers every caller of this client. Script
 * generation is deliberately not one of them: see
 * `classifyScriptCompletionError`.
 */
export function isRetryableOpenRouterError(error: unknown): boolean {
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
    name === 'APIConnectionTimeoutError' ||
    name === 'APITimeoutError' ||
    name === 'TimeoutError'
  );
}

type LLMCompletionOperation =
  | 'buildVisualSubjectCatalog'
  | 'generateLanguageClassrooms';

export async function createCompletionWithRetry(
  openai: OpenAI,
  params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
  thinkingModel: string | null,
  operation: LLMCompletionOperation,
  requestOptions: OpenRouterRequestOptions = {},
): Promise<OpenRouterChatCompletion> {
  for (let attempt = 1; attempt <= LLM_COMPLETION_MAX_ATTEMPTS; attempt++) {
    try {
      return await createOpenRouterChatCompletion(
        openai,
        params,
        thinkingModel,
        requestOptions,
      );
    } catch (error) {
      // A caller whose own signal is already aborted gains nothing from another
      // attempt. The per-request deadline aborts an internal signal instead, so
      // its `TimeoutError` still gets its retry.
      const shouldRetry =
        attempt < LLM_COMPLETION_MAX_ATTEMPTS &&
        !requestOptions.signal?.aborted &&
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

export type ScriptCompletionErrorCategory =
  | 'timeout'
  | 'retry_safe'
  | 'terminal';

/**
 * Script generation gets its own classification because the shared retry policy
 * is wrong for it in both directions.
 *
 * `timeout` is terminal: the deadline is already ten minutes, so a request that
 * hit it had a model working on it, and replaying an identical prompt just
 * spends those minutes again -- which is exactly how one ingest burned 248
 * seconds before failing. `retry_safe` failures never reached a model at all,
 * so a single re-route is genuinely a different attempt rather than a replay.
 */
export function classifyScriptCompletionError(
  error: unknown,
): ScriptCompletionErrorCategory {
  if (!error || typeof error !== 'object') return 'terminal';

  const name = (error as { name?: unknown }).name;
  if (
    name === 'TimeoutError' ||
    name === 'APITimeoutError' ||
    name === 'APIConnectionTimeoutError'
  ) {
    return 'timeout';
  }

  const status = (error as { status?: unknown }).status;
  if (typeof status === 'number') {
    return RETRYABLE_OPENROUTER_STATUS.has(status) || status >= 500
      ? 'retry_safe'
      : 'terminal';
  }

  return name === 'APIConnectionError' ? 'retry_safe' : 'terminal';
}

/**
 * One upstream request, successful or not. `ops.pipeline_stage_runs` can hold a
 * row per attempt, but the only place that knows how long a request ran, which
 * endpoint served it, and why it failed is this module -- a caller that sees
 * only the thrown error cannot reconstruct any of it.
 */
export interface LlmAttemptRecord {
  operation: 'generateScript';
  attempt: number;
  model: string;
  provider: string | null;
  status: 'completed' | 'failed';
  startedAt: Date;
  finishedAt: Date;
  elapsedMs: number;
  timeoutMs: number;
  inputChars: number;
  outputChars: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  generationId: string | null;
  routing: string;
  errorCategory: ScriptCompletionErrorCategory | null;
  errorMessage: string | null;
  costUsd: number | null;
}

export interface GenerateScriptOptions {
  onAttempt?: (record: LlmAttemptRecord) => void;
}

function tokenCount(
  usage: OpenRouterChatCompletion['usage'],
  key: 'prompt_tokens' | 'completion_tokens',
): number | null {
  const value = usage?.[key];
  return typeof value === 'number' ? value : null;
}

interface ScriptAttemptInput {
  openai: OpenAI;
  params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming;
  thinkingModel: string | null;
  routing: OpenRouterProviderRouting;
  attempt: number;
  onAttempt: GenerateScriptOptions['onAttempt'];
}

async function runScriptAttempt(
  input: ScriptAttemptInput,
): Promise<OpenRouterChatCompletion> {
  const startedAt = new Date();
  const base = {
    operation: 'generateScript' as const,
    attempt: input.attempt,
    model: input.params.model,
    startedAt,
    timeoutMs: SCRIPT_OPENROUTER_TIMEOUT_MS,
    inputChars: userInputCharacterCount(input.params.messages),
    routing: routingLabel(input.routing),
  };
  try {
    const completion = await createOpenRouterChatCompletion(
      input.openai,
      input.params,
      input.thinkingModel,
      {
        timeoutMs: SCRIPT_OPENROUTER_TIMEOUT_MS,
        providerRouting: input.routing,
      },
    );
    const metadata = completionMetadata(
      completion,
      input.params.model,
      input.thinkingModel,
    );
    emitScriptAttempt(input.onAttempt, {
      ...base,
      model: metadata.model,
      provider: metadata.provider,
      status: 'completed',
      ...elapsed(startedAt),
      outputChars: completionOutputCharacterCount(completion),
      promptTokens: tokenCount(completion.usage, 'prompt_tokens'),
      completionTokens: tokenCount(completion.usage, 'completion_tokens'),
      generationId: completion.id || null,
      errorCategory: null,
      errorMessage: null,
      costUsd: metadata.costUsd,
    });
    return completion;
  } catch (error) {
    emitScriptAttempt(input.onAttempt, {
      ...base,
      provider: null,
      status: 'failed',
      ...elapsed(startedAt),
      outputChars: null,
      promptTokens: null,
      completionTokens: null,
      generationId: null,
      errorCategory: classifyScriptCompletionError(error),
      errorMessage: errorMessage(error),
      costUsd: null,
    });
    throw error;
  }
}

function elapsed(startedAt: Date): { finishedAt: Date; elapsedMs: number } {
  const finishedAt = new Date();
  return {
    finishedAt,
    elapsedMs: finishedAt.getTime() - startedAt.getTime(),
  };
}

// Telemetry must never be the reason an ingest fails, so a throwing consumer is
// swallowed here rather than surfacing as a script-generation error.
function emitScriptAttempt(
  onAttempt: GenerateScriptOptions['onAttempt'],
  record: LlmAttemptRecord,
): void {
  if (!onAttempt) return;
  try {
    onAttempt(record);
  } catch (error) {
    logIngestEvent('llm:attempt-record-failed', {
      operation: record.operation,
      attempt: record.attempt,
      error: errorMessage(error),
    });
  }
}

async function createScriptCompletion(input: {
  openai: OpenAI;
  params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming;
  thinkingModel: string | null;
  nextAttempt: () => number;
  onAttempt: GenerateScriptOptions['onAttempt'];
}): Promise<OpenRouterChatCompletion> {
  const attemptInput = {
    openai: input.openai,
    params: input.params,
    thinkingModel: input.thinkingModel,
    onAttempt: input.onAttempt,
  };
  try {
    return await runScriptAttempt({
      ...attemptInput,
      routing: OPENROUTER_PROVIDER_ROUTING,
      attempt: input.nextAttempt(),
    });
  } catch (error) {
    if (classifyScriptCompletionError(error) !== 'retry_safe') throw error;
    logIngestEvent('llm:fallback', {
      operation: 'generateScript',
      model: input.params.model,
      routing: routingLabel(OPENROUTER_FALLBACK_ROUTING),
      error: errorMessage(error),
    });
    return await runScriptAttempt({
      ...attemptInput,
      routing: OPENROUTER_FALLBACK_ROUTING,
      attempt: input.nextAttempt(),
    });
  }
}

export async function generateScriptWithLLM(
  title: string,
  text: string,
  options: GenerateScriptOptions = {},
): Promise<ScriptResult> {
  const { openai, model, thinkingModel } = getOpenRouterConfig();
  const system = getSystemPrompt();
  let retryError: ScriptPayloadValidationError | null = null;
  let costUsd = 0;
  let attempt = 0;

  for (
    let payloadAttempt = 1;
    payloadAttempt <= SCRIPT_PAYLOAD_MAX_ATTEMPTS;
    payloadAttempt += 1
  ) {
    // Not a replay: the re-prompt carries the rejection reason, so the model is
    // being asked to fix a contract violation rather than to redo work that
    // already succeeded.
    const completion = await createScriptCompletion({
      openai,
      params: {
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
      nextAttempt: () => (attempt += 1),
      onAttempt: options.onAttempt,
    });

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
        payloadAttempt === SCRIPT_PAYLOAD_MAX_ATTEMPTS
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
      // parseLanguageClassroomLessons parses this as JSON either way; asking
      // for JSON mode is what stops the model prefacing it with prose.
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: languageClassroomSystemPrompt(input.sourceLanguageCode),
        },
        { role: 'user', content: buildLanguageClassroomUserMessage(input) },
      ],
      temperature: 0.4,
      max_tokens: LANGUAGE_CLASSROOM_MAX_TOKENS,
    },
    thinkingModel,
    'generateLanguageClassrooms',
    { reasoning: LANGUAGE_CLASSROOM_REASONING },
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

/**
 * Providers behind the same model id disagree about `json_object` mode: some
 * answer with the requested object, others nest it as a fenced string under an
 * arbitrary key (observed: {"stable diff":"ok","text":"```json…"}). Callers pass
 * the top-level keys their own schema expects, so a response that already has
 * the right shape is returned untouched.
 */
export function unwrapNestedJsonPayload(
  value: unknown,
  expectedKeys: readonly string[],
): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (expectedKeys.some((key) => key in record)) return value;

  for (const nested of Object.values(record)) {
    if (typeof nested !== 'string') continue;
    try {
      return JSON.parse(stripJsonFence(nested.trim()));
    } catch {
      continue;
    }
  }
  return value;
}
