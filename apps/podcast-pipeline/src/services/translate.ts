import type { LanguageClassroomLanguageCode } from '../types.js';
import type { UsageCostLine } from './cost.js';

export type SecondaryLanguageCode = Exclude<
  LanguageClassroomLanguageCode,
  'zh-Hant'
>;

const MAX_RETRIES = 2;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

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
  const result = await translateText(text, targetLanguageCode);

  return {
    text: result.text,
    cost: [buildGoogleTranslateCostLine(result.charCount, targetLanguageCode)],
  };
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
        data: {
          translations: { translatedText: string }[];
        };
      };

      return {
        text: data.data.translations[0]?.translatedText ?? '',
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
