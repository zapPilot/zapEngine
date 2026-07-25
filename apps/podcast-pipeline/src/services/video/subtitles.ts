import type { SlideVideoManifest } from './manifest.js';
import { characterUnits, lineUnits } from './text-units.js';

export { characterUnits } from './text-units.js';

export const MAX_LINE_UNITS = 26;

export interface SubtitleLayout {
  playResX: number;
  playResY: number;
  fontSize: number;
  marginX: number;
  marginV: number;
  maxLineUnits: number;
}

export const LANDSCAPE_SUBTITLE_LAYOUT: SubtitleLayout = {
  playResX: 1920,
  playResY: 1080,
  fontSize: 60,
  marginX: 150,
  marginV: 92,
  maxLineUnits: MAX_LINE_UNITS,
};

// Sized for the 1080x1920 news layout: captions sit inside the bottom band
// (y 1580-1920) below the media window.
export const PORTRAIT_SUBTITLE_LAYOUT: SubtitleLayout = {
  playResX: 1080,
  playResY: 1920,
  fontSize: 56,
  marginX: 54,
  marginV: 132,
  maxLineUnits: 17,
};

export function wrapSubtitle(
  text: string,
  maxLineUnits: number = MAX_LINE_UNITS,
): string[] {
  const explicitLines = text.split('\n');
  if (explicitLines.length > 2) {
    throw new Error('Subtitle contains more than two explicit lines');
  }
  if (explicitLines.length === 2) {
    if (explicitLines.some((line) => lineUnits(line) > maxLineUnits)) {
      throw new Error('Subtitle line is too long for the caption safe area');
    }
    return explicitLines;
  }

  const characters = Array.from(text);
  if (lineUnits(text) <= maxLineUnits) return [text];
  if (lineUnits(text) > maxLineUnits * 2) {
    throw new Error('Subtitle cannot fit within two lines');
  }

  let units = 0;
  let splitIndex = 0;
  for (const [index, character] of characters.entries()) {
    const nextUnits = units + characterUnits(character);
    if (nextUnits > maxLineUnits) break;
    units = nextUnits;
    splitIndex = index + 1;
  }

  const prohibitedLineStarts = new Set([
    '，',
    '。',
    '、',
    '：',
    '；',
    '！',
    '？',
    '）',
    '」',
    '』',
  ]);
  if (prohibitedLineStarts.has(characters[splitIndex] ?? '')) {
    splitIndex -= 1;
  }

  const lines = [
    characters.slice(0, splitIndex).join(''),
    characters.slice(splitIndex).join(''),
  ];
  if (splitIndex <= 0 || lines.some((line) => lineUnits(line) > maxLineUnits)) {
    throw new Error('Subtitle cannot fit within two lines');
  }
  return lines;
}

function assTimestamp(milliseconds: number): string {
  const centiseconds = Math.round(milliseconds / 10);
  const hours = Math.floor(centiseconds / 360_000);
  const minutes = Math.floor((centiseconds % 360_000) / 6_000);
  const seconds = Math.floor((centiseconds % 6_000) / 100);
  const remainder = centiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(remainder).padStart(2, '0')}`;
}

function escapeAssText(text: string): string {
  return text
    .replaceAll('\\', '\\N')
    .replaceAll('{', '\\{')
    .replaceAll('}', '\\}');
}

export function createAssSubtitles(
  captions: SlideVideoManifest['captions'],
  layout: SubtitleLayout = LANDSCAPE_SUBTITLE_LAYOUT,
): string {
  const dialogueLines = captions.map((caption) => {
    const wrapped = wrapSubtitle(caption.text, layout.maxLineUnits)
      .map(escapeAssText)
      .join('\\N');
    return `Dialogue: 0,${assTimestamp(caption.startMs)},${assTimestamp(caption.endMs)},Subtitle,,0,0,0,,${wrapped}`;
  });

  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${layout.playResX}`,
    `PlayResY: ${layout.playResY}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: TV.709',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Subtitle,Noto Sans CJK TC,${layout.fontSize},&H00F4F4F5,&H00F4F4F5,&H00101010,&H780A0A0A,0,0,0,0,100,100,0,0,1,3.2,0,2,${layout.marginX},${layout.marginX},${layout.marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...dialogueLines,
    '',
  ].join('\n');
}
