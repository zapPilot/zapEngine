import type { RuntimeModelVariant } from './runtimeModelSpec';

/**
 * Timing shared by the DOM and Skia renderers, so both draw the same frame at
 * the same moment of the loop. Pure functions only: no React, DOM, or Skia.
 */

/** Story time each variant rests on, from the design bundle. */
export const RESTING_TIME: Readonly<Record<RuntimeModelVariant, number>> = {
  firstRun: 0.09,
  runtime: 1,
};

/** Only First Run assembles; Runtime is a still. */
export const LOOPING: Readonly<Record<RuntimeModelVariant, boolean>> = {
  firstRun: true,
  runtime: false,
};

/** Length of the First Run assembly loop, in seconds. */
export const LOOP_SECONDS = 12;

/** Renderers sample the loop at this interval. */
export const FRAME_INTERVAL_MS = 30;

/** From here on the docked parts no longer bob, so ambient time is inert. */
const DOCKED_TIME = 0.07;

export interface AssemblyView {
  /** Story time passed to the engine as `t`. */
  readonly time: number;
  /** Ambient clock: seconds while the parts drift, 0 once they are docked. */
  readonly ambient: number;
}

const easeInOutCubic = (x: number) =>
  x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;

function assemblyTime(seconds: number): number {
  const rest = RESTING_TIME.firstRun;
  const tau = seconds % LOOP_SECONDS;
  if (tau < 0.8) return 0;
  if (tau < 4) return (rest * (tau - 0.8)) / 3.2;
  if (tau < 10.6) return rest;
  return rest * (1 - easeInOutCubic(Math.min(1, (tau - 10.6) / 1.4)));
}

/** The First Run assembly `seconds` into the loop: float, click together, hold, drift apart. */
export function assemblyView(seconds: number): AssemblyView {
  const time = assemblyTime(seconds);
  return { time, ambient: time < DOCKED_TIME ? seconds : 0 };
}

/** The view a renderer draws when it does not animate. */
export function restingView(variant: RuntimeModelVariant): AssemblyView {
  return { time: RESTING_TIME[variant], ambient: 0 };
}

/** Holding frames keep the same view, so renderers can skip redrawing them. */
export function sameView(a: AssemblyView, b: AssemblyView): boolean {
  return a.time === b.time && a.ambient === b.ambient;
}
