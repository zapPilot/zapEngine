import type { CSSProperties } from 'react';
import { Easing, interpolate } from 'remotion';

const easeOut = Easing.bezier(0.2, 0.65, 0.3, 0.99);

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** 0 → 1 over `duration` frames starting at `from`, with the site's ease-out. */
export function rise(frame: number, from: number, duration = 18): number {
  return interpolate(frame, [from, from + duration], [0, 1], {
    ...CLAMP,
    easing: easeOut,
  });
}

/** 0 → 1 with a symmetric ease, for camera moves and morphs. */
export function glide(frame: number, from: number, duration: number): number {
  return interpolate(frame, [from, from + duration], [0, 1], {
    ...CLAMP,
    easing: Easing.inOut(Easing.cubic),
  });
}

export interface EnterOptions {
  readonly duration?: number;
  /** Lift in px; negative drops in from above. */
  readonly distance?: number;
  /** Starting blur in px. */
  readonly blur?: number;
}

/** Fade, lift and de-blur into place: every entrance in the video. */
export function enter(
  frame: number,
  from: number,
  { duration = 18, distance = 28, blur = 0 }: EnterOptions = {},
): CSSProperties {
  const t = rise(frame, from, duration);
  return {
    opacity: t,
    translate: `0px ${((1 - t) * distance).toFixed(2)}px`,
    ...(blur > 0 ? { filter: `blur(${((1 - t) * blur).toFixed(2)}px)` } : {}),
  };
}
