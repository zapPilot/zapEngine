import { arcViolations, type Arc, type Group } from './arc.js';
export interface Stop extends Group {
  time: number;
}
export interface SceneWindow {
  id: string;
  from: number;
  to: number;
  fadeIn: number;
  fadeOut: number;
}
export interface Cut {
  id: string;
  duration: number;
  fps: number;
  width: number;
  height: number;
  poster: number;
  stops: readonly Stop[];
  windows: readonly SceneWindow[];
  arc: Arc;
}
export function cutViolations(cut: Cut): string[] {
  const errors = arcViolations(cut.stops, cut.arc);
  for (const key of ['duration', 'fps', 'width', 'height'] as const) {
    if (!Number.isFinite(cut[key]) || cut[key] <= 0) {
      errors.push(`${key} must be positive and finite`);
    }
  }
  if (
    !Number.isFinite(cut.poster) ||
    cut.poster < 0 ||
    cut.poster > cut.duration
  ) {
    errors.push('poster is outside the cut');
  }
  for (const window of cut.windows) {
    if (
      ![window.from, window.to, window.fadeIn, window.fadeOut].every(
        Number.isFinite,
      ) ||
      window.from >= window.to ||
      window.fadeIn < 0 ||
      window.fadeOut < 0 ||
      window.fadeIn + window.fadeOut > window.to - window.from
    ) {
      errors.push(`${window.id} has an invalid scene window`);
    }
  }
  for (const [i, stop] of cut.stops.entries()) {
    if (
      !Number.isFinite(stop.time) ||
      stop.time < 0 ||
      stop.time > cut.duration
    ) {
      errors.push(`${stop.id} is outside the cut`);
    }
    if (i > 0 && stop.time <= cut.stops[i - 1]!.time) {
      errors.push(`${stop.id} is not strictly increasing`);
    }
    if (
      !cut.windows.some(
        (w) => stop.time >= w.from + w.fadeIn && stop.time <= w.to - w.fadeOut,
      )
    ) {
      errors.push(`${stop.id} is outside a settled scene`);
    }
    if (
      cut.windows.some(
        (w) =>
          (stop.time >= w.from && stop.time < w.from + w.fadeIn) ||
          (stop.time > w.to - w.fadeOut && stop.time <= w.to),
      )
    ) {
      errors.push(`${stop.id} overlaps a fade`);
    }
  }
  return errors;
}
export function assertCut(cut: Cut): void {
  const errors = cutViolations(cut);
  if (errors.length) {
    throw new Error(`Invalid cut ${cut.id}: ${errors.join('; ')}`);
  }
}
