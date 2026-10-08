import { clamp } from './timeline.js';
export interface Hold {
  story: number;
  extra: number;
}
export interface TimeMap {
  duration: number;
  holds: readonly Hold[];
}
export function holdMap(
  duration: number,
  holds: readonly Hold[],
  maxDuration = 60,
  maxHold = 3.5,
): TimeMap {
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('Duration must be positive and finite');
  }
  if (
    !Number.isFinite(maxDuration) ||
    !Number.isFinite(maxHold) ||
    maxHold < 0
  ) {
    throw new Error('Hold limits must be finite and nonnegative');
  }
  const sorted = [...holds].sort((a, b) => a.story - b.story);
  for (const [i, hold] of sorted.entries()) {
    if (
      !Number.isFinite(hold.story) ||
      hold.story < 0 ||
      hold.story > duration ||
      !Number.isFinite(hold.extra) ||
      hold.extra < 0 ||
      hold.extra > maxHold
    ) {
      throw new Error('Hold exceeds its story or extension bounds');
    }
    if (i > 0 && hold.story === sorted[i - 1]!.story) {
      throw new Error('Duplicate hold time');
    }
  }
  const map = { duration, holds: sorted };
  if (cutDuration(map) > maxDuration) {
    throw new Error('Film exceeds maximum duration');
  }
  return map;
}
export const identityMap = (duration: number): TimeMap =>
  holdMap(duration, [], duration);
export const cutDuration = (map: TimeMap): number =>
  map.duration + map.holds.reduce((sum, hold) => sum + hold.extra, 0);
/** At a hold, clockAt selects its arrival; departure explicitly selects its end. */
export function clockAt(
  map: TimeMap,
  story: number,
  edge: 'arrival' | 'departure' = 'arrival',
): number {
  const s = clamp(story, 0, map.duration);
  return (
    s +
    map.holds.reduce(
      (sum, hold) =>
        sum +
        (hold.story < s || (hold.story === s && edge === 'departure')
          ? hold.extra
          : 0),
      0,
    )
  );
}
export function storyAt(map: TimeMap, clock: number): number {
  const c = clamp(clock, 0, cutDuration(map));
  let extra = 0;
  for (const hold of map.holds) {
    if (c <= hold.story + extra) {
      return c - extra;
    }
    if (c <= hold.story + extra + hold.extra) {
      return hold.story;
    }
    extra += hold.extra;
  }
  return c - extra;
}
