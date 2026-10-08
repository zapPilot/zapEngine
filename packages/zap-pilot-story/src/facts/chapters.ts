import { engineDecision } from './decision.js';
import { replay } from './replay.js';
import { ruleOf } from './rules.js';
export type ChapterId =
  | 'start'
  | 'risk-on'
  | 'defend'
  | 'exit'
  | 'spy'
  | 'back-in';
export interface Chapter {
  id: ChapterId;
  day: number;
  date: string;
}
export function deriveChapters(data: typeof replay = replay): Chapter[] {
  const equal = data.events.filter((event) => ruleOf(event.reason) === 2);
  const rotation = data.events.find((event) => ruleOf(event.reason) === 3);
  const exit = data.events.find((event) => ruleOf(event.reason) === 1);
  const anchors = [
    ['start', data.window.start],
    ['risk-on', equal[0]?.date],
    ['defend', rotation?.date],
    ['exit', exit?.date],
    ['spy', equal[1]?.date],
    ['back-in', equal[2]?.date],
  ] as const;
  return anchors.map(([id, date]) => {
    const day = data.series[0]!.values.findIndex(
      (point) => point.date === date,
    );
    if (date === undefined || day < 0) {
      throw new Error(`Missing chapter anchor: ${id}`);
    }
    return { id, date, day };
  });
}
export const chapters = deriveChapters();
export function chapterViolations(
  items: readonly Chapter[] = chapters,
  decisionDate = engineDecision().date,
): string[] {
  const errors: string[] = [];
  if (items.length !== chapters.length) {
    errors.push('chapter count is incomplete');
  }
  if (items.some((chapter, i) => i > 0 && chapter.day <= items[i - 1]!.day)) {
    errors.push('chapters are not strictly increasing');
  }
  if (items.find((chapter) => chapter.id === 'exit')?.date !== decisionDate) {
    errors.push('exit chapter does not match the recorded engine decision');
  }
  return errors;
}
