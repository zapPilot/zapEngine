import { expect, it } from 'vitest';

import { musicLoop } from '../music/library';
import { beatAtOrAfter, beatFrame, framesPerBeat } from './grid';

it('derives the beat from the loop period and its bars', () => {
  const loop = musicLoop('gentle-88');
  expect(framesPerBeat('gentle-88') * loop.cut.bars * 4).toBeCloseTo(
    (loop.periodSamples / loop.sampleRate) * loop.fps,
    9,
  );
  // 88-ish BPM at 30 fps: about twenty frames a beat.
  expect(framesPerBeat('gentle-88')).toBeGreaterThan(19);
  expect(framesPerBeat('gentle-88')).toBeLessThan(21);
});

it('finds the first beat at or after a frame, on whole frames', () => {
  expect(beatAtOrAfter(0, 15)).toBe(0);
  expect(beatAtOrAfter(15, 15)).toBe(15);
  expect(beatAtOrAfter(16, 15)).toBe(30);
  expect(beatAtOrAfter(20, 19.97)).toBe(20);
  expect(beatAtOrAfter(21, 19.97)).toBe(40);
  expect(beatAtOrAfter(19, 19.97)).toBe(20);
});

it('counts beats from a scene start that sits on the grid', () => {
  expect(beatFrame(30, 0, 15)).toBe(0);
  expect(beatFrame(30, 3, 15)).toBe(45);
  expect(beatFrame(40, 2, 19.97)).toBe(Math.round(4 * 19.97) - 40);
});
