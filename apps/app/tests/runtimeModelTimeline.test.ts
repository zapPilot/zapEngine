import { describe, expect, it } from 'vitest';

import {
  LOOP_SECONDS,
  assemblyView,
  restingView,
  sameView,
} from '@/components/runtime-model/runtimeModelTimeline';

describe('restingView', () => {
  it('rests First Run on the landed frame and Runtime on the finished model', () => {
    expect(restingView('firstRun')).toEqual({ time: 0.09, ambient: 0 });
    expect(restingView('runtime')).toEqual({ time: 1, ambient: 0 });
  });
});

describe('assemblyView', () => {
  it('holds the parts apart at t = 0 for the first 0.8 s while they drift', () => {
    expect(assemblyView(0)).toEqual({ time: 0, ambient: 0 });
    expect(assemblyView(0.5)).toEqual({ time: 0, ambient: 0.5 });
  });

  it('assembles linearly from 0.8 s to 4 s', () => {
    expect(assemblyView(2.4).time).toBeCloseTo(0.045, 12);
    expect(assemblyView(4).time).toBeCloseTo(0.09, 12);
  });

  it('keeps ambient time only while the parts are still docking', () => {
    expect(assemblyView(1).ambient).toBe(1);
    expect(assemblyView(3.9).ambient).toBe(0);
  });

  it('holds the landed frame from 4 s to 10.6 s with no ambient motion', () => {
    for (const seconds of [4, 7, 10.59]) {
      expect(assemblyView(seconds)).toEqual({ time: 0.09, ambient: 0 });
    }
  });

  it('rewinds with an ease-in-out cubic over the final 1.4 s', () => {
    expect(assemblyView(10.6).time).toBeCloseTo(0.09, 12);
    expect(assemblyView(11.3).time).toBeCloseTo(0.045, 12);
    expect(assemblyView(11.99).time).toBeLessThan(0.001);
  });

  it('repeats the assembly every LOOP_SECONDS so the loop restarts without a jump', () => {
    expect(LOOP_SECONDS).toBe(12);
    for (const seconds of [0, 2.4, 6, 11.3]) {
      expect(assemblyView(seconds + LOOP_SECONDS).time).toBeCloseTo(
        assemblyView(seconds).time,
        12,
      );
    }
  });
});

describe('sameView', () => {
  it('matches only views with identical time and ambient', () => {
    const landed = assemblyView(5);
    expect(sameView(landed, assemblyView(8))).toBe(true);
    expect(sameView(landed, { time: 0.09, ambient: 1 })).toBe(false);
    expect(sameView(landed, { time: 0.08, ambient: 0 })).toBe(false);
  });
});
