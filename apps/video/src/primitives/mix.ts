export interface Span {
  readonly from: number;
  readonly durationInFrames: number;
}

export interface DuckOptions {
  /** Music level with nobody speaking (0–1). */
  readonly base: number;
  /** Music level under narration (0–1). */
  readonly ducked: number;
  /** Frames to dip before a line and recover after it. */
  readonly ramp: number;
  readonly fadeIn: number;
  readonly fadeOut: number;
  readonly durationInFrames: number;
}

/** 0 away from the span, 1 inside it, linear ramps either side. */
function envelope(frame: number, span: Span, ramp: number): number {
  const start = span.from;
  const end = span.from + span.durationInFrames;
  if (frame <= start - ramp || frame >= end + ramp) return 0;
  if (frame < start) return (frame - (start - ramp)) / ramp;
  if (frame > end) return (end + ramp - frame) / ramp;
  return 1;
}

/**
 * Background-music level at `frame`: sits under the narration, lifts in the
 * pauses, and fades at both ends of the video.
 */
export function musicVolume(
  frame: number,
  voice: readonly Span[],
  options: DuckOptions,
): number {
  const duck = voice.reduce(
    (deepest, span) => Math.max(deepest, envelope(frame, span, options.ramp)),
    0,
  );
  const level = options.base + (options.ducked - options.base) * duck;
  const fadeIn = options.fadeIn > 0 ? frame / options.fadeIn : 1;
  const fadeOut =
    options.fadeOut > 0
      ? (options.durationInFrames - frame) / options.fadeOut
      : 1;
  return level * Math.min(Math.max(Math.min(fadeIn, fadeOut), 0), 1);
}
