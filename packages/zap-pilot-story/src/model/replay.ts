import { clamp, easeInOutCubic } from '@zapengine/story-kit';
import { replay } from '../facts/replay.js';
import { chapters } from '../facts/chapters.js';
import { eventLabel } from '../copy/replay.js';
import { ruleOf } from '../facts/rules.js';
const series = replay.series[0]!;
const max = series.values.length - 1;
export function dayAt(progress: number) {
  const f = clamp(progress);
  const anchors = [...chapters.map((ch) => ch.day), max];
  const hold = 0.06;
  const moving = 1 - hold * anchors.length;
  let accumulated = 0;
  for (let i = 0; i < anchors.length - 1; i++) {
    const day = anchors[i]!;
    if (f < accumulated + hold) {
      return { day, chapter: i };
    }
    accumulated += hold;
    const length = (moving * (anchors[i + 1]! - day)) / max;
    if (f < accumulated + length) {
      return {
        day:
          day +
          (anchors[i + 1]! - day) * easeInOutCubic((f - accumulated) / length),
        chapter: i,
      };
    }
    accumulated += length;
  }
  return { day: max, chapter: chapters.length - 1 };
}
export function replayView(progress: number) {
  const { day, chapter } = dayAt(progress);
  const index = Math.round(day);
  const date = series.values[index]!.date;
  const events = replay.events.filter((event) => event.date <= date);
  // The pinned trace has a rule event on day zero, so every valid frame has a latest move.
  const last = events.at(-1)!;
  return {
    day,
    chapter,
    date,
    fraction: day / max,
    strategy: series.values[index]!.value - 100,
    dca: replay.series[1]!.values[index]!.value - 100,
    allocation: replay.allocations.values[index]!,
    fired: events.length,
    last: eventLabel(last),
    lastDate: last.date,
    lastRule: ruleOf(last.reason),
  };
}
export const replayChart = replay.series.map((item) =>
  item.values
    .map(
      (p, i) =>
        `${((i / max) * 1000).toFixed(1)},${(((200 - p.value) / 140) * 320).toFixed(1)}`,
    )
    .join(' '),
);
export const eventRug = replay.events
  .map((event) => {
    const i = series.values.findIndex((p) => p.date === event.date);
    return `M${((i / max) * 1000).toFixed(1)} 0V10`;
  })
  .join(' ');
export const allocationPolygons = replay.allocations.assets.map(
  (asset, slot) => {
    const sum = (i: number, n: number) =>
      replay.allocations.values[i]!.slice(0, n).reduce((a, b) => a + b, 0) *
      100;
    const top = series.values.map(
      (_, i) => `${((i / max) * 1000).toFixed(1)},${sum(i, slot).toFixed(1)}`,
    );
    const bottom = series.values
      .map(
        (_, i) =>
          `${((i / max) * 1000).toFixed(1)},${sum(i, slot + 1).toFixed(1)}`,
      )
      .reverse();
    return {
      asset: asset.toLowerCase() === 'stable' ? 'stable' : asset.toLowerCase(),
      points: [...top, ...bottom].join(' '),
    };
  },
);
