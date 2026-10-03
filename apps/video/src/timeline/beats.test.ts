import { describe, expect, it } from 'vitest';

import { beatOf, cueFrame } from './beats';
import type { TimedScene } from './timeline';

const scene: TimedScene = {
  spec: { id: 'proof', props: {}, vo: [] },
  from: 300,
  durationInFrames: 200,
  beats: [
    {
      line: { id: 'first', text: 'aaaa bbbb' },
      file: 'a.mp3',
      from: 12,
      durationInFrames: 90,
    },
  ],
};

describe('beatOf', () => {
  it('finds a beat by line id', () => {
    expect(beatOf(scene, 'first').from).toBe(12);
  });

  it('names the scene when the line is missing', () => {
    expect(() => beatOf(scene, 'nope')).toThrow(
      'Scene "proof" has no line "nope".',
    );
  });
});

describe('cueFrame', () => {
  it('is scene-relative: beat start plus the cue offset', () => {
    expect(cueFrame(scene, 'first', 'bbbb')).toBe(62);
  });
});
