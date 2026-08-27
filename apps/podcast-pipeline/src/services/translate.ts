import { errorMessage } from '../lib/errorMessage.js';
import { sleep } from '../lib/sleep.js';
import { isPlainRecord as isRecord } from '../lib/typeGuards.js';
import type { LanguageClassroomLanguageCode } from '../types.js';
import { sumUsageCostLines, type UsageCostLine } from './cost.js';
import { logIngestEvent } from './ingest/step.js';
import {
  createOpenRouterChatCompletion,
  getOpenRouterConfig,
  isRetryableOpenRouterError,
  type OpenRouterChatCompletion,
} from './llm.js';

export type SecondaryLanguageCode = Exclude<
  LanguageClassroomLanguageCode,
  'zh-Hant'
>;

const TRANSLATION_MODEL = 'openrouter/free';
const TRANSLATION_MAX_ATTEMPTS = 2;
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
  const { fields, cost } = await translateFields(
    { title, script },
    targetLanguageCode,
  );
  return { title: fields.title, script: fields.script, cost };
}

export async function translateChineseText(
  text: string,
  targetLanguageCode: SecondaryLanguageCode,
): Promise<{ text: string; cost: UsageCostLine[] }> {
  const { fields, cost } = await translateFields({ text }, targetLanguageCode);
  return { text: fields.text, cost };
}

/**
 * Translate named Traditional Chinese fields through OpenRouter's free-model
 * router. The model is intentionally code-owned: translation quality follows
 * the router's current free pool without a deploy-time model override.
 *
 * Empty source fields are preserved locally. A failure gets one bounded retry
 * and then fails closed; there is no secondary translation provider. A response
 * that arrived but is unusable carries its rejection reason into the retry —
 * at `temperature: 0` an identical re-prompt would reproduce the same bad
 * output, so the correction is what makes the second attempt worth paying for.
 */
async function translateFields<K extends string>(
  fields: Record<K, string>,
  targetLanguageCode: SecondaryLanguageCode,
): Promise<{ fields: Record<K, string>; cost: UsageCostLine[] }> {
  if (!Object.values<string>(fields).some((value) => value.length > 0)) {
    return { fields: { ...fields }, cost: [] };
  }

  const costs: UsageCostLine[] = [];
  let retryReason: string | null = null;

  for (let attempt = 1; ; attempt += 1) {
    try {
      const result = await translateFieldsWithOpenRouter(
        fields,
        targetLanguageCode,
        retryReason,
      );
      return { fields: result.fields, cost: [...costs, ...result.cost] };
    } catch (error) {
      const attemptCost = translationAttemptCost(error);
      if (attemptCost) {
        costs.push(attemptCost);
      }

      if (
        attempt >= TRANSLATION_MAX_ATTEMPTS ||
        !shouldRetryTranslation(error)
      ) {
        logIngestEvent('translate:failed', {
          targetLanguageCode,
          model: TRANSLATION_MODEL,
          attempts: attempt,
          spentUsd: sumUsageCostLines(costs),
          error: errorMessage(error),
        });
        throw error;
      }

      logIngestEvent('translate:retry', {
        targetLanguageCode,
        model: TRANSLATION_MODEL,
        attempt,
        nextAttempt: attempt + 1,
        delayMs: TRANSLATION_RETRY_DELAY_MS,
        error: errorMessage(error),
      });
      retryReason =
        error instanceof TranslationResponseError ? error.message : null;
      await sleep(TRANSLATION_RETRY_DELAY_MS);
    }
  }
}

async function translateFieldsWithOpenRouter<K extends string>(
  fields: Record<K, string>,
  targetLanguageCode: SecondaryLanguageCode,
  retryReason: string | null,
): Promise<{ fields: Record<K, string>; cost: UsageCostLine[] }> {
  const keys = Object.keys(fields) as K[];
  const { completion, model } = await createTranslationCompletion(
    targetLanguageCode,
    JSON.stringify(fields),
    Object.fromEntries(keys.map((key) => [key, '...'])),
    retryReason,
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
  retryReason: string | null,
): Promise<{ completion: OpenRouterChatCompletion; model: string }> {
  const { openai, model } = getOpenRouterConfig({
    model: TRANSLATION_MODEL,
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
  );

  return { completion, model };
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
