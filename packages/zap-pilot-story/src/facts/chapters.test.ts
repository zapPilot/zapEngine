import { expect, it } from 'vitest';
import { chapterViolations, chapters, deriveChapters } from './chapters.js';
import { replay } from './replay.js';
import { engineDecision } from './decision.js';
import { ruleOf } from './rules.js';
it('derives six historical anchors and the recorded decision from facts', () => {
  expect(chapters.map((chapter) => chapter.day)).toEqual([
    0, 16, 52, 147, 319, 453,
  ]);
  expect(chapterViolations()).toEqual([]);
  expect(engineDecision()).toMatchObject({
    rule: 1,
    dmaDistance: { SPY: 10.37, BTC: -1.11, ETH: 20.44 },
    held: [13.39, 0.35, 3.88, 82.38, 0],
    target: [0, 0, 3.88, 96.12],
  });
  expect(() => ruleOf('unknown')).toThrow('Unknown strategy reason');
});
it('rejects missing, reordered and inconsistent chapter anchors', () => {
  expect(chapterViolations([], '2020-01-01')).toEqual([
    'chapter count is incomplete',
    'exit chapter does not match the recorded engine decision',
  ]);
  expect(chapterViolations([...chapters].reverse())).toContain(
    'chapters are not strictly increasing',
  );
  expect(chapterViolations(chapters, '2020-01-01')).toContain(
    'exit chapter does not match the recorded engine decision',
  );
  expect(() => deriveChapters({ ...replay, events: [] })).toThrow(
    'Missing chapter anchor',
  );
  expect(() =>
    deriveChapters({
      ...replay,
      window: { ...replay.window, start: '2020-01-01' },
    }),
  ).toThrow('Missing chapter anchor');
  expect(() =>
    deriveChapters({
      ...replay,
      events: replay.events.filter((event) => ruleOf(event.reason) !== 3),
    }),
  ).toThrow('Missing chapter anchor');
  expect(() =>
    deriveChapters({
      ...replay,
      events: replay.events.filter((event) => ruleOf(event.reason) !== 1),
    }),
  ).toThrow('Missing chapter anchor');
});
