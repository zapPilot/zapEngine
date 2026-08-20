import type { LanguageClassroomLanguageCode } from '../../types.js';
import { coerceToSupportedLanguage } from '../podcast/classroom-language.js';
import {
  HEADLINE_MAX_TITLE_LINES,
  HEADLINE_MAX_UNITS_PER_LINE,
} from './manifest.js';
import { characterUnits, lineUnits } from './text-units.js';

const ELLIPSIS = '…';

const HEADLINE_KICKERS: Record<LanguageClassroomLanguageCode, string> = {
  'zh-Hant': '鏈上快訊',
  ja: 'チェーン速報',
  en: 'CHAIN BRIEF',
};

export function headlineKickerFor(languageCode: string): string {
  return HEADLINE_KICKERS[coerceToSupportedLanguage(languageCode)];
}

// Latin words stay whole so wrapping never splits inside a word; CJK glyphs
// wrap freely. Whitespace becomes an explicit separator token.
function tokenize(title: string): string[] {
  const tokens: string[] = [];
  let latinRun = '';
  for (const character of Array.from(title.trim())) {
    if (/\s/.test(character)) {
      if (latinRun) {
        tokens.push(latinRun);
        latinRun = '';
      }
      tokens.push(' ');
      continue;
    }
    if (characterUnits(character) < 1) {
      latinRun += character;
      continue;
    }
    if (latinRun) {
      tokens.push(latinRun);
      latinRun = '';
    }
    tokens.push(character);
  }
  if (latinRun) tokens.push(latinRun);
  return tokens;
}

function splitOversizedToken(token: string, maxUnits: number): string[] {
  const pieces: string[] = [];
  let piece = '';
  for (const character of Array.from(token)) {
    if (piece && lineUnits(piece + character) > maxUnits) {
      pieces.push(piece);
      piece = '';
    }
    piece += character;
  }
  if (piece) pieces.push(piece);
  return pieces;
}

export function wrapHeadlineTitle(
  title: string,
  options: { maxUnitsPerLine?: number; maxLines?: number } = {},
): string[] {
  const maxUnits = options.maxUnitsPerLine ?? HEADLINE_MAX_UNITS_PER_LINE;
  const maxLines = options.maxLines ?? HEADLINE_MAX_TITLE_LINES;

  const tokens = tokenize(title).flatMap((token) =>
    token !== ' ' && lineUnits(token) > maxUnits
      ? splitOversizedToken(token, maxUnits)
      : [token],
  );

  const lines: string[] = [];
  let current = '';
  let pendingSpace = false;
  for (const token of tokens) {
    if (token === ' ') {
      pendingSpace = current.length > 0;
      continue;
    }
    const separator = pendingSpace ? ' ' : '';
    const candidate = current ? `${current}${separator}${token}` : token;
    pendingSpace = false;
    if (lineUnits(candidate) <= maxUnits) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = token;
  }
  if (current) lines.push(current);

  if (lines.length === 0) {
    throw new Error('Headline title produced no displayable lines');
  }
  if (lines.length <= maxLines) return lines;

  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1] ?? '';
  while (last && lineUnits(last + ELLIPSIS) > maxUnits) {
    last = Array.from(last).slice(0, -1).join('').trimEnd();
  }
  kept[maxLines - 1] = `${last}${ELLIPSIS}`;
  return kept;
}
