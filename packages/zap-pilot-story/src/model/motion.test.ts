import { describe, expect, it } from 'vitest';
import { engineScene } from './engine.js';
import {
  allocationPolygons,
  dayAt,
  replayChart,
  replayView,
} from './replay.js';
import { engineDecision } from '../facts/decision.js';
import { chapters } from '../facts/chapters.js';
import { STAGES } from '../copy/beats.js';
import { replay } from '../facts/replay.js';
describe('approved Motion geometry', () => {
  it('retains the poster camera and floating strategy, wallet and wireframe machine', () => {
    const scene = engineScene(0);
    expect(scene.cam).toContain('rotateX(57.00deg) rotateZ(-34.00deg)');
    expect(scene.ox).toBe('62%');
    expect(scene.faces.some((f) => f.text === 'SIGNS THE BATCH')).toBe(true);
    expect(scene.faces.some((f) => f.bd.includes('dashed'))).toBe(true);
    expect(scene.faces.every((f) => f.tf.includes('var(--zp-u)'))).toBe(true);
    expect(engineScene(0, 0, true).ox).toBe('50%');
  });
  it(
    'produces finite geometry at every frame and all seven stages',
    // CI runners exceed the 5s default: 5.7s in run 37727273799 and 7.9s in
    // coverage for the same 1001-frame exhaustive check under cache contention.
    { timeout: 20_000 },
    () => {
      const invalidFrames: number[] = [];
      const undersizedFrames: number[] = [];
      for (let frame = 0; frame <= 1000; frame++) {
        const scene = engineScene(frame / 1000, frame / 30, frame % 2 === 0);
        if (/NaN|Infinity|undefined/.test(JSON.stringify(scene)))
          invalidFrames.push(frame);
        if (scene.faces.length <= 40) undersizedFrames.push(frame);
      }
      expect(invalidFrames).toEqual([]);
      expect(undersizedFrames).toEqual([]);
      expect(STAGES.map((s) => s.name)).toEqual([
        'Parts',
        'Observe',
        'Evaluate',
        'Target',
        'Plan',
        'Check',
        'Sign',
        'Status',
      ]);
      const end = engineScene(1);
      expect(end.dial.val).toBe(`${engineDecision().stablePercent}%`);
      expect(end.labels.map((l) => l.t)).toContain('YOUR MACHINE');
      expect(engineScene(-1)).toEqual(engineScene(0));
      expect(engineScene(2)).toEqual(engineScene(1));
    },
  );
});
describe('pinned replay geometry', () => {
  it('holds at chapters, starts at the first date and reaches the pinned result', () => {
    expect(dayAt(-1)).toEqual({ day: 0, chapter: 0 });
    expect(dayAt(1)).toEqual({ day: 497, chapter: 5 });
    expect(replayView(0).date).toBe(replay.window.start);
    expect(replayView(1).date).toBe(replay.window.end);
    expect(replayView(1).fired).toBe(63);
    expect(replayView(1).strategy).toBeCloseTo(89.34, 2);
    const seen = new Set<number>();
    for (let i = 0; i <= 1000; i++) {
      const v = dayAt(i / 1000);
      seen.add(v.chapter);
      expect(v.day).toBeGreaterThanOrEqual(0);
      expect(v.day).toBeLessThanOrEqual(497);
    }
    expect([...seen]).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it('derives chart and allocation paths from every aligned row, including corrected post-319 data', () => {
    expect(
      chapters.slice(1).map((c) => +((c.day / 497) * 1000).toFixed(1)),
    ).toEqual([32.2, 104.6, 295.8, 641.9, 911.5]);
    expect(replayChart[0]!.split(' ')).toHaveLength(498);
    expect(allocationPolygons).toHaveLength(4);
    for (const polygon of allocationPolygons) {
      expect(polygon.points.split(' ')).toHaveLength(996);
      expect(polygon.points).not.toMatch(/NaN/);
    }
    const view = replayView(1);
    expect(view.allocation).toEqual(replay.allocations.values.at(-1));
  });
});
