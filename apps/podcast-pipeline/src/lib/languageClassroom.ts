import type {
  LanguageClassroomKeyword,
  LanguageClassroomLesson,
} from '../types.js';
import { readNullableString, readString } from './string.js';

export interface NormalizeKeywordsOptions {
  maxKeywords?: number;
}

export interface NormalizeLessonOptions extends NormalizeKeywordsOptions {
  sourceLanguageCode?: string;
  requireKeywords?: boolean;
}

export function normalizeLanguageClassroomLesson(
  raw: unknown,
  options: NormalizeLessonOptions = {},
): LanguageClassroomLesson | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const value = raw as Record<string, unknown>;
  const sourceLanguageCode =
    options.sourceLanguageCode ??
    readString(value['sourceLanguageCode'] ?? value['source_language_code']);
  const targetLanguageCode = readString(
    value['targetLanguageCode'] ?? value['target_language_code'],
  );
  const oneLiner = readString(value['oneLiner'] ?? value['one_liner']);
  const keywords = normalizeLanguageClassroomKeywords(value['keywords'], {
    maxKeywords: options.maxKeywords,
  });

  if (!sourceLanguageCode || !targetLanguageCode || !oneLiner) return null;
  if (options.requireKeywords && keywords.length === 0) return null;

  return {
    sourceLanguageCode,
    targetLanguageCode,
    oneLiner,
    keywords,
  };
}

export function normalizeLanguageClassroomKeywords(
  value: unknown,
  options: NormalizeKeywordsOptions = {},
): LanguageClassroomKeyword[] {
  if (!Array.isArray(value)) return [];

  const keywords = value
    .map(normalizeLanguageClassroomKeyword)
    .filter((keyword): keyword is LanguageClassroomKeyword => keyword !== null);

  return options.maxKeywords === undefined
    ? keywords
    : keywords.slice(0, options.maxKeywords);
}

export function normalizeLanguageClassroomKeyword(
  raw: unknown,
): LanguageClassroomKeyword | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const value = raw as Record<string, unknown>;
  const term = readString(value['term']);
  const meaning = readString(value['meaning']);

  if (!term || !meaning) return null;

  return {
    term,
    reading: readNullableString(value['reading']),
    meaning,
    note: readNullableString(value['note']),
  };
}
