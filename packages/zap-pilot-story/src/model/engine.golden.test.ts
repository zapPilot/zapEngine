import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
const FROZEN_DECISION = vi.hoisted(() => ({
  dmaDistance: { SPY: 10.37, BTC: -1.11, ETH: 20.44 },
  held: [13.39, 0.35, 3.88, 82.38, 0],
  target: [0, 0, 3.88, 96.12],
}));
vi.mock('../facts/decision.js', () => ({
  engineDecision: () => FROZEN_DECISION,
}));
import { engineScene } from './engine.js';
// Frozen pre-refactor motion boundaries, including each staggered observation.
const THRESHOLDS = [
  0.0, 0.015, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.098, 0.1, 0.105, 0.11,
  0.11399999999999999, 0.115, 0.12, 0.123, 0.13, 0.14, 0.14900000000000002,
  0.15, 0.158, 0.255, 0.26, 0.265, 0.27, 0.28, 0.29, 0.32, 0.35, 0.41, 0.42,
  0.425, 0.43, 0.44, 0.45, 0.455, 0.51, 0.525, 0.53, 0.55, 0.555, 0.56, 0.6,
  0.605, 0.61, 0.635, 0.76, 0.765, 0.785, 0.79, 0.8, 0.805, 0.885, 0.89, 0.9,
  0.96,
];
const TIMES = [
  ...new Set([
    ...Array.from({ length: 101 }, (_, index) => index / 100),
    ...THRESHOLDS.flatMap((time) => [time - 1e-4, time, time + 1e-4]),
  ]),
].sort((a, b) => a - b);
const ROOT = new URL('./__golden__/', import.meta.url);
it('preserves every pre-refactor CSS frame for the frozen decision', () => {
  const frames = TIMES.flatMap((time) =>
    [0, 1.3, 2.99].flatMap((ambient) =>
      [false, true].map((narrow) => ({
        time,
        ambient,
        narrow,
        sha256: createHash('sha256')
          .update(JSON.stringify(engineScene(time, ambient, narrow)))
          .digest('hex'),
      })),
    ),
  );
  const readable = {
    '0.09': engineScene(0.09, 0, true),
    '1': engineScene(1, 0, true),
  };
  const hashes = new URL('engine-css.json', ROOT);
  const snapshots = new URL('engine-css-readable.json', ROOT);
  if (process.env['UPDATE_GOLDEN'] === '1') {
    mkdirSync(ROOT, { recursive: true });
    writeFileSync(hashes, JSON.stringify(frames, null, 2) + '\n');
    writeFileSync(snapshots, JSON.stringify(readable, null, 2) + '\n');
  }
  expect(frames.length).toBeGreaterThan(1200);
  expect(frames).toEqual(JSON.parse(readFileSync(hashes, 'utf8')));
  expect(readable).toEqual(JSON.parse(readFileSync(snapshots, 'utf8')));
}, 60_000);
