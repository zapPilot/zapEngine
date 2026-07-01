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

function getGoogleTranslateApiKey(): string {
  const key = process.env['GOOGLE_TRANSLATE_API_KEY'];
  if (!key) {
    throw new Error(
      'Missing required environment variable: GOOGLE_TRANSLATE_API_KEY',
    );
  }
  return key;
}

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
  if (title.length > 0 || script.length > 0) {
    try {
      return await translateCanonicalScriptWithOpenRouter({
        title,
        script,
        targetLanguageCode,
      });
    } catch {
      // Fall back to Google Translate for transient OpenRouter/model issues.
    }
  }

  const [translatedTitle, translatedScript] = await Promise.all([
    translateText(title, targetLanguageCode),
    translateText(script, targetLanguageCode),
  ]);

  return {
    title: translatedTitle.text,
    script: translatedScript.text,
    cost: [
      buildGoogleTranslateCostLine(
        translatedTitle.charCount + translatedScript.charCount,
        targetLanguageCode,
      ),
    ],
  };
}

export async function translateChineseText(
  text: string,
  targetLanguageCode: SecondaryLanguageCode,
): Promise<{ text: string; cost: UsageCostLine[] }> {
  if (text.length > 0) {
    try {
      return await translateChineseTextWithOpenRouter(text, targetLanguageCode);
    } catch {
      // Fall back to Google Translate for transient OpenRouter/model issues.
    }
  }

  const result = await translateText(text, targetLanguageCode);

  return {
    text: result.text,
    cost: [buildGoogleTranslateCostLine(result.charCount, targetLanguageCode)],
  };
}

async function translateCanonicalScriptWithOpenRouter({
  title,
  script,
  targetLanguageCode,
}: TranslateCanonicalScriptOptions): Promise<TranslateCanonicalScriptResult> {
  const { completion, model } = await createTranslationCompletion(
    targetLanguageCode,
    JSON.stringify({ title, script }),
    {
      title: '...',
      script: '...',
    },
  );
  const payload = parseTranslationJson(completion);

  return {
    title: readTranslatedField(payload, 'title', title),
    script: readTranslatedField(payload, 'script', script),
    cost: [
      buildOpenRouterTranslateCostLine(completion, model, targetLanguageCode),
    ],
  };
}

async function translateChineseTextWithOpenRouter(
  text: string,
  targetLanguageCode: SecondaryLanguageCode,
): Promise<{ text: string; cost: UsageCostLine[] }> {
  const { completion, model } = await createTranslationCompletion(
    targetLanguageCode,
    JSON.stringify({ text }),
    {
      text: '...',
    },
  );
  const payload = parseTranslationJson(completion);

  return {
    text: readTranslatedField(payload, 'text', text),
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

  const apiKey = getGoogleTranslateApiKey();

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
