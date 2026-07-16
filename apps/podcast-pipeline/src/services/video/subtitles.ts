import type { SlideVideoManifest } from './manifest.js';

export const MAX_LINE_UNITS = 26;

export function characterUnits(character: string): number {
  return (character.codePointAt(0) ?? 0) <= 0xff ? 0.55 : 1;
}

function lineUnits(text: string): number {
  return Array.from(text).reduce(
    (total, character) => total + characterUnits(character),
    0,
  );
}

export function wrapSubtitle(text: string): string[] {
  const explicitLines = text.split('\n');
  if (explicitLines.length > 2) {
    throw new Error('Subtitle contains more than two explicit lines');
  }
  if (explicitLines.length === 2) {
    if (explicitLines.some((line) => lineUnits(line) > MAX_LINE_UNITS)) {
      throw new Error('Subtitle line is too long for the 1080p safe area');
    }
    return explicitLines;
  }

  const characters = Array.from(text);
  if (lineUnits(text) <= MAX_LINE_UNITS) return [text];
  if (lineUnits(text) > MAX_LINE_UNITS * 2) {
    throw new Error('Subtitle cannot fit within two lines');
  }

  let units = 0;
  let splitIndex = 0;
  for (const [index, character] of characters.entries()) {
    const nextUnits = units + characterUnits(character);
    if (nextUnits > MAX_LINE_UNITS) break;
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
  if (
    splitIndex <= 0 ||
    lines.some((line) => lineUnits(line) > MAX_LINE_UNITS)
  ) {
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
): string {
  const dialogueLines = captions.map((caption) => {
    const wrapped = wrapSubtitle(caption.text).map(escapeAssText).join('\\N');
    return `Dialogue: 0,${assTimestamp(caption.startMs)},${assTimestamp(caption.endMs)},Subtitle,,0,0,0,,${wrapped}`;
  });

  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    'PlayResX: 1920',
    'PlayResY: 1080',
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: TV.709',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Subtitle,Noto Sans CJK TC,60,&H00F4F4F5,&H00F4F4F5,&H00101010,&H780A0A0A,0,0,0,0,100,100,0,0,1,3.2,0,2,150,150,92,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...dialogueLines,
    '',
  ].join('\n');
}
