export const clamp = (value: number, min = 0, max = 1): number =>
  Math.max(min, Math.min(max, value));
export const lerp = (from: number, to: number, amount: number): number =>
  from + (to - from) * amount;
export const easeInOutCubic = (x: number): number =>
  x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
export const progress = (time: number, from: number, to: number): number =>
  to === from ? Number(time >= to) : clamp((time - from) / (to - from));
export const fadeWindow = (
  time: number,
  from: number,
  to: number,
  fadeIn: number,
  fadeOut: number,
): number =>
  progress(time, from, from + fadeIn) * (1 - progress(time, to - fadeOut, to));
export const wrap = (value: number, length: number): number =>
  ((value % length) + length) % length;
export const signedPercent = (value: number): string =>
  `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)}%`;
export type Keyframe = readonly [time: number, value: number];
export function keyframes(time: number, frames: readonly Keyframe[]): number {
  if (frames.length === 0) {
    throw new Error('Keyframes must not be empty');
  }
  if (
    frames.some(
      (frame, i) =>
        !Number.isFinite(frame[0]) ||
        !Number.isFinite(frame[1]) ||
        (i > 0 && frame[0] <= frames[i - 1]![0]),
    )
  ) {
    throw new Error('Keyframes must be finite and strictly increasing');
  }
  if (time <= frames[0]![0]) {
    return frames[0]![1];
  }
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1]!;
    const b = frames[i]!;
    if (time <= b[0]) {
      return lerp(a[1], b[1], easeInOutCubic(progress(time, a[0], b[0])));
    }
  }
  return frames.at(-1)![1];
}
