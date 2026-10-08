import { expect, it } from 'vitest';
import { replay, replayDay, replayViolations } from './replay.js';
it('pins the historical calendar independently of rolling refreshes', () => {
  expect(replay.window.end).toBe('2026-10-05');
  expect(replay.series[0]!.values).toHaveLength(498);
  expect(replay.events).toHaveLength(63);
  expect(replayViolations()).toEqual([]);
  expect([replayDay(-1), replayDay(0.5), replayDay(2)]).toEqual([0, 249, 497]);
  expect(replay.provenance.commit).toBe(
    '99426e898b6761765961fb97849da375fdcf6b15',
  );
});
it('rejects date, series, allocation and event corruption', () => {
  const check = (mutate: (data: typeof replay) => void, error: string) => {
    const data = structuredClone(replay);
    mutate(data);
    expect(replayViolations(data)).toContain(error);
  };
  const aligned = 'replay series are not aligned and finite';
  check((d) => {
    d.series[1]!.values.pop();
  }, aligned);
  check((d) => {
    d.series[1]!.values[0]!.date = '2020-01-01';
  }, aligned);
  check((d) => {
    d.series[1]!.values[0]!.value = NaN;
  }, aligned);
  check((d) => {
    d.series[0]!.values[1]!.date = d.series[0]!.values[0]!.date;
  }, 'replay dates are not strictly increasing');
  check((d) => {
    d.window.start = '2020-01-01';
  }, 'replay does not match its source window');
  check((d) => {
    d.window.end = '2020-01-01';
  }, 'replay does not match its source window');
  const allocations = 'replay allocations are invalid';
  check((d) => {
    d.allocations.values.pop();
  }, allocations);
  check((d) => {
    d.allocations.values[0]!.pop();
  }, allocations);
  check((d) => {
    d.allocations.values[0]![0] = NaN;
  }, allocations);
  check((d) => {
    d.allocations.values[0]![0] = -1;
  }, allocations);
  check((d) => {
    d.allocations.values[0]![0] = 1;
  }, allocations);
  check((d) => {
    d.events[0]!.date = '2020-01-01';
  }, 'replay event is outside its calendar');
  check((d) => {
    d.snapshot.reference_date = '2020-01-01';
  }, 'replay snapshot is not pinned to its end');
});
