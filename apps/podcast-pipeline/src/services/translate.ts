import { getRequiredEnv } from '../lib/env.js';
import type { LanguageClassroomLanguageCode } from '../types.js';
import type { UsageCostLine } from './cost.js';
import {
  createOpenRouterChatCompletion,
  getOpenRouterConfig,
  type OpenRouterChatCompletion,
} from './llm.js';

export type SecondaryLanguageCode = Exclude<
  LanguageClassroomLanguageCode,
  'zh-Hant'
>;

const MAX_RETRIES = 2;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const DEFAULT_TRANSLATION_MODEL = 'openrouter/free';
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
 * Translate a set of named fields in one request, OpenRouter first. A provider
 * response that is missing, blank, or chatter for any field rejects the whole
 * set and the caller falls back to Google Translate, which is billed on the
 * source characters that actually went through it.
 */
async function translateFields<K extends string>(
  fields: Record<K, string>,
  targetLanguageCode: SecondaryLanguageCode,
): Promise<{ fields: Record<K, string>; cost: UsageCostLine[] }> {
  const entries = Object.entries(fields) as [K, string][];

  if (entries.some(([, value]) => value.length > 0)) {
    try {
      return await translateFieldsWithOpenRouter(fields, targetLanguageCode);
    } catch {
      // Fall back to Google Translate for transient OpenRouter/model issues.
    }
  }

  const translated = await Promise.all(
    entries.map(([, value]) => translateText(value, targetLanguageCode)),
  );

  return {
    fields: Object.fromEntries(
      entries.map(([key], index) => [key, translated[index]!.text]),
    ) as Record<K, string>,
    cost: [
      buildGoogleTranslateCostLine(
        translated.reduce((total, result) => total + result.charCount, 0),
        targetLanguageCode,
      ),
    ],
  };
}

async function translateFieldsWithOpenRouter<K extends string>(
  fields: Record<K, string>,
  targetLanguageCode: SecondaryLanguageCode,
): Promise<{ fields: Record<K, string>; cost: UsageCostLine[] }> {
  const keys = Object.keys(fields) as K[];
  const { completion, model } = await createTranslationCompletion(
    targetLanguageCode,
    JSON.stringify(fields),
    Object.fromEntries(keys.map((key) => [key, '...'])),
  );
  const payload = parseTranslationJson(completion);

  return {
    fields: Object.fromEntries(
      keys.map((key) => [key, readTranslatedField(payload, key, fields[key])]),
    ) as Record<K, string>,
    cost: [
      buildOpenRouterTranslateCostLine(completion, model, targetLanguageCode),
    ],
  };
}

async function createTranslationCompletion(
  targetLanguageCode: SecondaryLanguageCode,
  inputJson: string,
  outputFormat: Record<string, string>,
): Promise<{ completion: OpenRouterChatCompletion; model: string }> {
  const model =
    process.env['TRANSLATION_LLM_MODEL'] || DEFAULT_TRANSLATION_MODEL;
  const { openai, model: resolvedModel } = getOpenRouterConfig({
    model,
    thinkingModel: null,
  });

  const completion = await createOpenRouterChatCompletion(
    openai,
    {
      model: resolvedModel,
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
          content: `Input JSON:\n${inputJson}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    },
    null,
  );

  return { completion, model: resolvedModel };
}

function buildTranslationSystemPrompt(
  targetLanguageCode: SecondaryLanguageCode,
  outputFormat: Record<string, string>,
): string {
  return [
    'You are a translation engine for podcast scripts.',
    '',
    `Translate Traditional Chinese into ${TARGET_LANGUAGE_NAMES[targetLanguageCode]}.`,
    'Do not summarize.',
    'Do not add explanations.',
    'Do not add markdown.',
    'Preserve paragraph breaks.',
    'Preserve URLs, numbers, tickers, names, and technical terms.',
    'Return valid JSON only.',
    '',
    'Output format:',
    JSON.stringify(outputFormat, null, 2),
  ].join('\n');
}

function parseTranslationJson(
  completion: OpenRouterChatCompletion,
): Record<string, unknown> {
  const content = completion.choices[0]?.message?.content ?? '';
  const trimmed = content.trim();
  if (!trimmed || trimmed.startsWith('```')) {
    throw new Error('OpenRouter translation returned invalid JSON content');
  }

  const parsed = JSON.parse(trimmed) as unknown;
  if (!isRecord(parsed)) {
    throw new Error('OpenRouter translation JSON must be an object');
  }

  return parsed;
}

function readTranslatedField(
  payload: Record<string, unknown>,
  field: string,
  sourceText: string,
): string {
  const value = payload[field];
  if (typeof value !== 'string') {
    throw new Error(`OpenRouter translation missing ${field}`);
  }
  if (sourceText.length > 0 && value.trim().length === 0) {
    throw new Error(`OpenRouter translation returned empty ${field}`);
  }
  if (sourceText.length > 0 && looksLikeModelChatter(value)) {
    throw new Error(`OpenRouter translation returned explanatory ${field}`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

interface TranslateResult {
  text: string;
  charCount: number;
}

async function translateText(
  text: string,
  targetLanguageCode: SecondaryLanguageCode,
): Promise<TranslateResult> {
  if (text.length === 0) {
    return { text: '', charCount: 0 };
  }

  const apiKey = getRequiredEnv('GOOGLE_TRANSLATE_API_KEY');

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: text,
          source: 'zh-TW',
          target: targetLanguageCode,
          format: 'text',
        }),
      },
    );

    if (response.ok) {
      const data = (await response.json()) as {
        data?: {
          translations?: { translatedText?: unknown }[];
        };
      };

      const translatedText = data.data?.translations?.[0]?.translatedText;
      if (
        typeof translatedText !== 'string' ||
        translatedText.trim().length === 0
      ) {
        throw new Error('Google Translate API returned empty translation');
      }

      return {
        text: translatedText,
        charCount: text.length,
      };
    }

    const errorBody = await response.text();
    lastError = new Error(
      `Google Translate API error: ${response.status} - ${errorBody}`,
    );

    if (!RETRYABLE_STATUS.has(response.status)) {
      throw lastError;
    }

    if (attempt < MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }

  if (!lastError) {
    throw new Error('Google Translate API failed with no error recorded');
  }

  throw lastError;
}

function buildGoogleTranslateCostLine(
  charCount: number,
  targetLanguageCode: SecondaryLanguageCode,
): UsageCostLine {
  return {
    category: 'translate',
    label: `Translation ${targetLanguageCode}`,
    provider: 'google',
    model: 'translate-api',
    costUsd: charCount * 0.00002,
  };
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
