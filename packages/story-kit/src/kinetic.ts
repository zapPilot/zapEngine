import { clamp, easeInOutCubic } from './timeline.js';
export type KineticStyle = '' | 'o' | 's' | 'm';
export type KineticSpec = readonly (readonly string[])[];
export interface KineticWord {
  text: string;
  style: KineticStyle;
  index: number;
}
export interface KineticLine {
  words: readonly KineticWord[];
  underline: 'signature' | 'rule' | null;
}
export interface KineticPose extends KineticWord {
  translateY: number;
  opacity: number;
}
export function parseKinetic(spec: KineticSpec): KineticLine[] {
  let index = 0;
  return spec.map((line) => ({
    words: line.map((value) => {
      const [text, style = ''] = value.split('|');
      if (!['', 'o', 's', 'm'].includes(style)) {
        throw new Error(`Unknown kinetic style: ${style}`);
      }
      return { text: text!, style: style as KineticStyle, index: index++ };
    }),
    underline: null,
  }));
}
export const kineticText = (lines: readonly KineticLine[]): string =>
  lines.map((line) => line.words.map((word) => word.text).join(' ')).join(' ');
/** Exact Motion/Film kw() timings. true disables exit; a number drives external exit. */
export function kineticPoses(
  lines: readonly KineticLine[],
  q: number,
  exit?: boolean | number,
): KineticPose[][] {
  return lines.map((line) =>
    line.words.map((word) => {
      const enter = easeInOutCubic(clamp((q - word.index * 0.035) / 0.16));
      const leave =
        exit === true
          ? 0
          : easeInOutCubic(
              clamp(
                typeof exit === 'number'
                  ? exit * 1.3 - word.index * 0.04
                  : (q - 0.84 - word.index * 0.01) / 0.1,
              ),
            );
      return {
        ...word,
        translateY: (1 - enter) * 108 - leave * 108,
        opacity: Math.max(0, Math.min(enter, 1 - leave)),
      };
    }),
  );
}
