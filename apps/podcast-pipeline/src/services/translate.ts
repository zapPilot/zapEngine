import { errorMessage } from '../lib/errorMessage.js';
import { sleep } from '../lib/sleep.js';
import { isPlainRecord as isRecord } from '../lib/typeGuards.js';
import type { LanguageClassroomLanguageCode } from '../types.js';
import { sumUsageCostLines, type UsageCostLine } from './cost.js';
import { logIngestEvent } from './ingest/step.js';
import { getTranslationFallbackModels } from './llm-model-fallback.js';
import {
  createOpenRouterChatCompletion,
  getOpenRouterConfig,
  isRetryableOpenRouterError,
  OPENROUTER_FALLBACK_ROUTING,
  type OpenRouterChatCompletion,
  type OpenRouterProviderRouting,
} from './llm.js';
import { splitCanonicalSentences } from './video/storyboard/sentences.js';

export type SecondaryLanguageCode = Exclude<
  LanguageClassroomLanguageCode,
  'zh-Hant'
>;

const TRANSLATION_MODEL = 'openrouter/free';
const TRANSLATION_MAX_ATTEMPTS = 2;
const TRANSLATION_MAX_CHUNK_CHARS = 2_000;
const TRANSLATION_RETRY_DELAY_MS = 500;
const TARGET_LANGUAGE_NAMES: Record<SecondaryLanguageCode, string> = {
  ja: 'Japanese',
  en: 'English',
};

export interface TranslateCanonicalScriptOptions {
  title: string;
  script: string;
  targetLanguageCode: SecondaryLanguageCode;
}

export interface TranslateCanonicalScriptResult {
  title: string;
  script: string;
  cost: UsageCostLine[];
}

interface TranslationModelAttempt<K extends string> {
  fields: Record<K, string> | null;
  cost: UsageCostLine[];
  error: unknown;
  attempts: number;
}

/** A completed request whose response cannot be used as a translation. */
class TranslationResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranslationResponseError';
  }
}

export async function translateCanonicalScript({
  title,
  script,
  targetLanguageCode,
}: TranslateCanonicalScriptOptions): Promise<TranslateCanonicalScriptResult> {
  const chunks = splitScriptIntoTranslationChunks(
    script,
    TRANSLATION_MAX_CHUNK_CHARS,
  );
  if (chunks.length <= 1) {
    const { fields, cost } = await translateFields(
      { title, script },
      targetLanguageCode,
    );
    return { title: fields.title, script: fields.script, cost };
  }

  let translatedTitle = title;
  const translatedChunks: string[] = [];
  const cost: UsageCostLine[] = [];
  for (const [index, chunk] of chunks.entries()) {
    logIngestEvent('translate:chunk', {
      targetLanguageCode,
      chunkIndex: index + 1,
      chunkCount: chunks.length,
      chunkChars: chunk.length,
      scriptChars: script.length,
    });
    if (index === 0) {
      const result = await translateFields(
        { title, script: chunk },
        targetLanguageCode,
        cost,
      );
      translatedTitle = result.fields.title;
      translatedChunks.push(result.fields.script);
      cost.push(...result.cost);
      continue;
    }

    const result = await translateFields(
      { script: chunk },
      targetLanguageCode,
      cost,
    );
    translatedChunks.push(result.fields.script);
    cost.push(...result.cost);
  }

  return {
    title: translatedTitle,
    script: translatedChunks.join('\n\n'),
    cost,
  };
}

export async function translateChineseText(
  text: string,
  targetLanguageCode: SecondaryLanguageCode,
): Promise<{ text: string; cost: UsageCostLine[] }> {
  const { fields, cost } = await translateFields({ text }, targetLanguageCode);
  return { text: fields.text, cost };
}

/**
 * Translate named Traditional Chinese fields through OpenRouter's free router.
 * A retryable free-router failure gets one bounded retry before the request
 * advances through the paid models configured by TRANSLATION_FALLBACK_MODELS.
 * Authentication/configuration failures still fail immediately because changing
 * models cannot repair them.
 *
 * Empty source fields are preserved locally. A response that arrived but is
 * unusable carries its rejection reason into the retry — at `temperature: 0`
 * an identical re-prompt would reproduce the same bad output, so the correction
 * is what makes the second attempt worth paying for.
 */
async function translateFields<K extends string>(
  fields: Record<K, string>,
  targetLanguageCode: SecondaryLanguageCode,
  priorCost: readonly UsageCostLine[] = [],
): Promise<{ fields: Record<K, string>; cost: UsageCostLine[] }> {
  if (!Object.values<string>(fields).some((value) => value.length > 0)) {
    return { fields: { ...fields }, cost: [] };
  }

  const costs: UsageCostLine[] = [];
  const models = translationModelCandidates();

  for (const [modelIndex, model] of models.entries()) {
    const attempt = await tryTranslationModel(
      fields,
      targetLanguageCode,
      model,
    );
    costs.push(...attempt.cost);
    if (attempt.fields) {
      return { fields: attempt.fields, cost: costs };
    }

    const error =
      attempt.error ??
      new Error('Translation failed without an OpenRouter error');
    const nextModel = models[modelIndex + 1];
    if (shouldRetryTranslation(error) && nextModel) {
      logIngestEvent('translate:model-fallback', {
        targetLanguageCode,
        model,
        nextModel,
        attempts: attempt.attempts,
        spentUsd: sumUsageCostLines([...priorCost, ...costs]),
        error: errorMessage(error),
      });
      continue;
    }

    logTranslationFailure(
      targetLanguageCode,
      model,
      attempt.attempts,
      priorCost,
      costs,
      error,
    );
    throw error as Error;
  }

  throw new Error('Translation failed without an OpenRouter model candidate');
}

async function tryTranslationModel<K extends string>(
  fields: Record<K, string>,
  targetLanguageCode: SecondaryLanguageCode,
  model: string,
): Promise<TranslationModelAttempt<K>> {
  const costs: UsageCostLine[] = [];
  let retryReason: string | null = null;
  let providerRouting: OpenRouterProviderRouting | undefined;

  for (let attempt = 1; attempt <= TRANSLATION_MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await translateFieldsWithOpenRouter(
        fields,
        targetLanguageCode,
        model,
        retryReason,
        providerRouting,
      );
      return {
        fields: result.fields,
        cost: [...costs, ...result.cost],
        error: null,
        attempts: attempt,
      };
    } catch (error) {
      const attemptCost = translationAttemptCost(error);
      if (attemptCost) {
        costs.push(attemptCost);
      }
      if (!shouldRetryTranslation(error) || attempt === TRANSLATION_MAX_ATTEMPTS) {
        return {
          fields: null,
          cost: costs,
          error,
          attempts: attempt,
        };
      }

      const rerouted = !(error instanceof TranslationResponseError);
      logIngestEvent('translate:retry', {
        targetLanguageCode,
        model,
        attempt,
        nextAttempt: attempt + 1,
        delayMs: TRANSLATION_RETRY_DELAY_MS,
        rerouted,
        error: errorMessage(error),
      });
      retryReason =
        error instanceof TranslationResponseError ? error.message : null;
      providerRouting = rerouted ? OPENROUTER_FALLBACK_ROUTING : undefined;
      await sleep(TRANSLATION_RETRY_DELAY_MS);
    }
  }

  return {
    fields: null,
    cost: costs,
    error: new Error('Translation attempts exhausted unexpectedly'),
    attempts: TRANSLATION_MAX_ATTEMPTS,
  };
}

function translationModelCandidates(): string[] {
  return [TRANSLATION_MODEL, ...getTranslationFallbackModels()].filter(
    (model, index, all) => Boolean(model) && all.indexOf(model) === index,
  );
}

function logTranslationFailure(
  targetLanguageCode: SecondaryLanguageCode,
  model: string,
  attempts: number,
  priorCost: readonly UsageCostLine[],
  costs: readonly UsageCostLine[],
  error: unknown,
): void {
  logIngestEvent('translate:failed', {
    targetLanguageCode,
    model,
    attempts,
    spentUsd: sumUsageCostLines([...priorCost, ...costs]),
    error: errorMessage(error),
  });
}

async function translateFieldsWithOpenRouter<K extends string>(
  fields: Record<K, string>,
  targetLanguageCode: SecondaryLanguageCode,
  translationModel: string,
  retryReason: string | null,
  providerRouting: OpenRouterProviderRouting | undefined,
): Promise<{ fields: Record<K, string>; cost: UsageCostLine[] }> {
  const keys = Object.keys(fields) as K[];
  const { completion, model } = await createTranslationCompletion(
    targetLanguageCode,
    JSON.stringify(fields),
    Object.fromEntries(keys.map((key) => [key, '...'])),
    translationModel,
    retryReason,
    providerRouting,
  );
  const costLine = buildOpenRouterTranslateCostLine(
    completion,
    model,
    targetLanguageCode,
  );

  try {
    const payload = parseTranslationJson(completion);
    return {
      fields: Object.fromEntries(
        keys.map((key) => [
          key,
          readTranslatedField(payload, key, fields[key]),
        ]),
      ) as Record<K, string>,
      cost: [costLine],
    };
  } catch (error) {
    // The request completed and is billed even though its response is unusable.
    if (error instanceof TranslationResponseError) {
      Object.assign(error, { translationAttemptCost: costLine });
    }
    throw error;
  }
}

async function createTranslationCompletion(
  targetLanguageCode: SecondaryLanguageCode,
  inputJson: string,
  outputFormat: Record<string, string>,
  translationModel: string,
  retryReason: string | null,
  providerRouting: OpenRouterProviderRouting | undefined,
): Promise<{ completion: OpenRouterChatCompletion; model: string }> {
  const { openai, model } = getOpenRouterConfig({
    model: translationModel,
    thinkingModel: null,
  });

  const completion = await createOpenRouterChatCompletion(
    openai,
    {
      model,
      messages: [
        {
          role: 'system',
          content: buildTranslationSystemPrompt(
            targetLanguageCode,
            outputFormat,
          ),
        },
        {
          role: 'user',
          content: buildTranslationUserMessage(inputJson, retryReason),
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    },
    null,
    providerRouting ? { providerRouting } : {},
  );

  return { completion, model };
}

function splitScriptIntoTranslationChunks(
  script: string,
  maxChars: number,
): string[] {
  if (script.length === 0) return [];
  if (script.length <= maxChars) return [script];

  const chunks: string[] = [];
  let pending = '';
  const flushPending = (): void => {
    if (!pending) return;
    chunks.push(pending);
    pending = '';
  };

  for (const rawParagraph of script.split(/\n{2,}/u)) {
    const paragraph = rawParagraph.trim();
    if (!paragraph) continue;
    if (paragraph.length > maxChars) {
      flushPending();
      chunks.push(...splitLongTranslationParagraph(paragraph, maxChars));
      continue;
    }

    const candidate = pending ? `${pending}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxChars) {
      pending = candidate;
      continue;
    }
    flushPending();
    pending = paragraph;
  }
  flushPending();
  return chunks;
}

function splitLongTranslationParagraph(
  paragraph: string,
  maxChars: number,
): string[] {
  const sentences = splitCanonicalSentences(paragraph);
  if (sentences.length === 0) {
    return hardSliceTranslationText(paragraph, maxChars);
  }

  const chunks: string[] = [];
  let chunkStart: number | null = null;
  let chunkEnd = 0;
  const flushSentenceChunk = (): void => {
    if (chunkStart === null) return;
    const chunk = paragraph.slice(chunkStart, chunkEnd).trim();
    if (chunk) chunks.push(chunk);
    chunkStart = null;
    chunkEnd = 0;
  };

  for (const sentence of sentences) {
    if (sentence.text.length > maxChars) {
      flushSentenceChunk();
      chunks.push(...hardSliceTranslationText(sentence.text, maxChars));
      continue;
    }
    if (chunkStart === null) {
      chunkStart = sentence.startOffset;
      chunkEnd = sentence.endOffset;
      continue;
    }

    const candidate = paragraph.slice(chunkStart, sentence.endOffset).trim();
    if (candidate.length <= maxChars) {
      chunkEnd = sentence.endOffset;
      continue;
    }
    flushSentenceChunk();
    chunkStart = sentence.startOffset;
    chunkEnd = sentence.endOffset;
  }
  flushSentenceChunk();
  return chunks;
}

function hardSliceTranslationText(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += maxChars) {
    chunks.push(text.slice(index, index + maxChars));
  }
  return chunks;
}

function buildTranslationSystemPrompt(
  targetLanguageCode: SecondaryLanguageCode,
  outputFormat: Record<string, string>,
): string {
  return [
    `Translate Traditional Chinese into ${TARGET_LANGUAGE_NAMES[targetLanguageCode]}.`,
    'Preserve meaning, paragraph breaks, URLs, numbers, tickers, names, and technical terms.',
    'Do not summarize, explain, or add markdown.',
    'Keep any field whose input value is empty as an empty string.',
    `Return valid JSON only in this shape: ${JSON.stringify(outputFormat)}`,
  ].join('\n');
}

function buildTranslationUserMessage(
  inputJson: string,
  retryReason: string | null,
): string {
  const input = `Input JSON:\n${inputJson}`;
  if (retryReason === null) {
    return input;
  }
  return `${input}\n\nCorrection required: the previous response was rejected (${retryReason}). Return only a parseable JSON object in the requested shape. Every non-empty input field must map to a pure translation with no preamble, explanation, markdown, or code fence.`;
}

function parseTranslationJson(
  completion: OpenRouterChatCompletion,
): Record<string, unknown> {
  const content = completion.choices[0]?.message?.content ?? '';
  const trimmed = content.trim();
  if (!trimmed || trimmed.startsWith('```')) {
    throw new TranslationResponseError(
      'OpenRouter translation returned invalid JSON content',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch (error) {
    throw new TranslationResponseError(
      `OpenRouter translation returned invalid JSON: ${errorMessage(error)}`,
    );
  }

  if (!isRecord(parsed)) {
    throw new TranslationResponseError(
      'OpenRouter translation JSON must be an object',
    );
  }

  return parsed;
}

function readTranslatedField(
  payload: Record<string, unknown>,
  field: string,
  sourceText: string,
): string {
  if (sourceText.length === 0) {
    return '';
  }

  const value = payload[field];
  if (typeof value !== 'string') {
    throw new TranslationResponseError(
      `OpenRouter translation missing ${field}`,
    );
  }
  if (value.trim().length === 0) {
    throw new TranslationResponseError(
      `OpenRouter translation returned empty ${field}`,
    );
  }
  if (looksLikeModelChatter(value)) {
    throw new TranslationResponseError(
      `OpenRouter translation returned explanatory ${field}`,
    );
  }
  return value;
}

function looksLikeModelChatter(text: string): boolean {
  const trimmed = text.trimStart();
  const lower = trimmed.toLowerCase();
  return (
    trimmed.startsWith('```') ||
    lower.startsWith('here is the translation') ||
    lower.startsWith("here's the translation") ||
    lower.startsWith('translation:') ||
    lower.startsWith('translated text:')
  );
}

function shouldRetryTranslation(error: unknown): boolean {
  return (
    error instanceof TranslationResponseError ||
    isRetryableOpenRouterError(error)
  );
}

function translationAttemptCost(error: unknown): UsageCostLine | null {
  if (!error || typeof error !== 'object') {
    return null;
  }
  const cost = (error as { translationAttemptCost?: unknown })
    .translationAttemptCost;
  return isUsageCostLine(cost) ? cost : null;
}

function isUsageCostLine(value: unknown): value is UsageCostLine {
  return (
    isRecord(value) &&
    value['category'] === 'translate' &&
    typeof value['label'] === 'string' &&
    typeof value['provider'] === 'string' &&
    typeof value['model'] === 'string' &&
    typeof value['costUsd'] === 'number'
  );
}

function buildOpenRouterTranslateCostLine(
  completion: OpenRouterChatCompletion,
  translationModel: string,
  targetLanguageCode: SecondaryLanguageCode,
): UsageCostLine {
  const usage = completion.usage as { cost?: unknown } | undefined;
  return {
    category: 'translate',
    label: `Translation ${targetLanguageCode}`,
    provider: completion.provider || 'openrouter',
    model: completion.model || translationModel,
    costUsd: typeof usage?.cost === 'number' ? usage.cost : 0,
  };
}
