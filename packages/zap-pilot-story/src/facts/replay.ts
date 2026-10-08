import { clamp } from '@zapengine/story-kit';
import replay from './data/replay-2026-10-05.json' with { type: 'json' };
export { replay };
export function replayDay(progress: number): number {
  return Math.round(clamp(progress) * (replay.series[0]!.values.length - 1));
}
export function replayViolations(data: typeof replay = replay): string[] {
  const errors: string[] = [];
  const dates = data.series[0]!.values.map((point) => point.date);
  if (
    data.series.some(
      (series) =>
        series.values.length !== dates.length ||
        series.values.some(
          (point, i) =>
            point.date !== dates[i] || !Number.isFinite(point.value),
        ),
    )
  ) {
    errors.push('replay series are not aligned and finite');
  }
  if (dates.some((date, i) => i > 0 && date <= dates[i - 1]!)) {
    errors.push('replay dates are not strictly increasing');
  }
  if (dates[0] !== data.window.start || dates.at(-1) !== data.window.end) {
    errors.push('replay does not match its source window');
  }
  if (
    data.allocations.values.length !== dates.length ||
    data.allocations.values.some(
      (row) =>
        row.length !== data.allocations.assets.length ||
        row.some((value) => !Number.isFinite(value) || value < 0) ||
        Math.abs(row.reduce((sum, value) => sum + value, 0) - 1) > 0.001,
    )
  ) {
    errors.push('replay allocations are invalid');
  }
  if (data.events.some((event) => !dates.includes(event.date))) {
    errors.push('replay event is outside its calendar');
  }
  if (data.snapshot.reference_date !== data.window.end) {
    errors.push('replay snapshot is not pinned to its end');
  }
  return errors;
}
