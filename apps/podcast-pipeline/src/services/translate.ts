import { v2 as translateV2 } from '@google-cloud/translate';

import type { LanguageClassroomLanguageCode } from '../types.js';
import type { UsageCostLine } from './cost.js';
import { resolveGcpClientOptions } from './gcp-credentials.js';

const { Translate } = translateV2;

const SOURCE_LANGUAGE = 'zh-TW';
const MAX_TRANSLATE_CHARACTERS = 28_000;
const GOOGLE_TRANSLATE_PRICE_USD_PER_CHARACTER = 20 / 1_000_000;
const GOOGLE_TRANSLATE_MODEL = 'nmt';

type TranslateClient = InstanceType<typeof Translate>;
export type SecondaryLanguageCode = Exclude<
  LanguageClassroomLanguageCode,
  'zh-Hant'
>;

const GOOGLE_TRANSLATE_TARGET: Record<SecondaryLanguageCode, string> = {
  ja: 'ja',
  en: 'en',
};

let client: TranslateClient | null = null;
let clientOptionsKey: string | null = null;

function getClient(): TranslateClient {
  const clientOptions = resolveGcpClientOptions();
  const nextClientOptionsKey = JSON.stringify(clientOptions ?? null);
  if (!client || clientOptionsKey !== nextClientOptionsKey) {
    client = new Translate(clientOptions);
    clientOptionsKey = nextClientOptionsKey;
  }
  return client;
}

export interface TranslateCanonicalScriptOptions {
  title: string;
  script: string;
  targetLanguageCode: SecondaryLanguageCode;
  maxCharactersPerRequest?: number;
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
  maxCharactersPerRequest = MAX_TRANSLATE_CHARACTERS,
}: TranslateCanonicalScriptOptions): Promise<TranslateCanonicalScriptResult> {
  const titleChunks = splitTextIntoTranslationChunks(
    title,
    maxCharactersPerRequest,
  );
  const scriptChunks = splitTextIntoTranslationChunks(
    script,
    maxCharactersPerRequest,
  );
  const [translatedTitleChunks, translatedScriptChunks] = await Promise.all([
    translateChunks(titleChunks, targetLanguageCode),
    translateChunks(scriptChunks, targetLanguageCode),
  ]);

  return {
    title: translatedTitleChunks.join(''),
    script: translatedScriptChunks.join(''),
    cost: [
      buildGoogleTranslateCostLine(
        [...titleChunks, ...scriptChunks],
        targetLanguageCode,
      ),
    ],
  };
}

export async function translateChineseText(
  text: string,
  targetLanguageCode: SecondaryLanguageCode,
  maxCharactersPerRequest = MAX_TRANSLATE_CHARACTERS,
): Promise<{ text: string; cost: UsageCostLine[] }> {
  const chunks = splitTextIntoTranslationChunks(text, maxCharactersPerRequest);
  const translatedChunks = await translateChunks(chunks, targetLanguageCode);

  return {
    text: translatedChunks.join(''),
    cost: [buildGoogleTranslateCostLine(chunks, targetLanguageCode)],
  };
}

export function splitTextIntoTranslationChunks(
  text: string,
  maxCharacters: number = MAX_TRANSLATE_CHARACTERS,
): string[] {
  if (maxCharacters < 1) {
    throw new Error('maxCharacters must be greater than 0');
  }
  if (text.length === 0) {
    return [];
  }

  const chunks: string[] = [];
  let currentChunk = '';
  let currentChunkCharacters = 0;

  for (const segment of splitSentenceSegments(text)) {
    const segmentCharacters = countUnicodeCharacters(segment);
    if (currentChunkCharacters + segmentCharacters <= maxCharacters) {
      currentChunk += segment;
      currentChunkCharacters += segmentCharacters;
      continue;
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    if (segmentCharacters > maxCharacters) {
      const oversizedChunks = splitOversizedText(segment, maxCharacters);
      chunks.push(...oversizedChunks.slice(0, -1));
      currentChunk = oversizedChunks.at(-1) ?? '';
      currentChunkCharacters = countUnicodeCharacters(currentChunk);
    } else {
      currentChunk = segment;
      currentChunkCharacters = segmentCharacters;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

export function buildGoogleTranslateCostLine(
  texts: string[],
  targetLanguageCode: SecondaryLanguageCode,
): UsageCostLine {
  const characters = texts.reduce(
    (sum, text) => sum + countUnicodeCharacters(text),
    0,
  );

  return {
    category: 'translate',
    label: `Translation ${targetLanguageCode}`,
    provider: 'google',
    model: GOOGLE_TRANSLATE_MODEL,
    costUsd: characters * GOOGLE_TRANSLATE_PRICE_USD_PER_CHARACTER,
    usage: {
      unit: 'characters',
      quantity: characters,
      unitPriceUsd: GOOGLE_TRANSLATE_PRICE_USD_PER_CHARACTER,
    },
  };
}

async function translateChunks(
  chunks: string[],
  targetLanguageCode: SecondaryLanguageCode,
): Promise<string[]> {
  const translatedChunks: string[] = [];
  for (const chunk of chunks) {
    translatedChunks.push(await translateText(chunk, targetLanguageCode));
  }
  return translatedChunks;
}

async function translateText(
  text: string,
  targetLanguageCode: SecondaryLanguageCode,
): Promise<string> {
  if (!text) {
    return '';
  }

  const [rawTranslation] = (await getClient().translate(text, {
    from: SOURCE_LANGUAGE,
    to: GOOGLE_TRANSLATE_TARGET[targetLanguageCode],
  })) as unknown as [unknown];
  const translation = Array.isArray(rawTranslation)
    ? rawTranslation[0]
    : rawTranslation;
  return typeof translation === 'string'
    ? translation
    : String(translation ?? '');
}

function splitSentenceSegments(text: string): string[] {
  return text.match(/[^。！？.!?\n]+[。！？.!?]?\s*|\n+/gu) ?? [text];
}

function splitOversizedText(text: string, maxCharacters: number): string[] {
  const chunks: string[] = [];
  let currentChunk = '';
  let currentChunkCharacters = 0;

  for (const char of text) {
    if (currentChunkCharacters + 1 > maxCharacters) {
      chunks.push(currentChunk);
      currentChunk = char;
      currentChunkCharacters = 1;
    } else {
      currentChunk += char;
      currentChunkCharacters += 1;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function countUnicodeCharacters(text: string): number {
  return [...text].length;
}
