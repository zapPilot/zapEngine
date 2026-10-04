import { describe, expect, it } from 'vitest';

import { beatOf, cueAt, cueFrame, cuePhrases, unspokenCues } from './beats';
import type { Beat, TimedScene } from './timeline';
import type { Storyboard } from './types';

const beat = (id: string, cueText: string, from: number): Beat => ({
  line: { id, text: `caption of ${id}` },
  cueText,
  file: `${id}.mp3`,
  from,
  durationInFrames: 90,
});

const scene: TimedScene = {
  spec: { id: 'proof', props: {}, vo: [] },
  from: 300,
  durationInFrames: 300,
  beats: [beat('first', 'aaaa bbbb', 12), beat('second', 'cccc bbbb', 120)],
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
  it('is scene-relative: beat start plus the cue offset in the cue text', () => {
    expect(cueFrame(scene, 'first', 'bbbb')).toBe(62);
    expect(() => cueFrame(scene, 'first', 'caption')).toThrow(
      'Cue "caption" is not in the line "aaaa bbbb".',
    );
  });
});

describe('cueAt', () => {
  it('finds the one line that speaks the cue', () => {
    expect(cueAt(scene, 'cccc')).toBe(120);
    expect(cueAt(scene, 'aaaa b')).toBe(12);
  });

  it('rejects a cue spoken in no line or in several', () => {
    expect(() => cueAt(scene, 'dddd')).toThrow(
      'Scene "proof": cue "dddd" is spoken in 0 lines; it must be in exactly one.',
    );
    expect(() => cueAt(scene, 'bbbb')).toThrow(
      'Scene "proof": cue "bbbb" is spoken in 2 lines (first, second); it must be in exactly one.',
    );
  });
});

describe('cuePhrases', () => {
  it('collects every cue and …Cue string at any depth', () => {
    expect(
      cuePhrases({
        kicker: 'not a cue',
        punchCue: 'Few',
        codehash: { cue: 'pinned', label: 'no' },
        steps: [{ cue: 'first' }, 'Cue-less string'],
        count: 3,
        empty: null,
      }),
    ).toEqual(['Few', 'pinned', 'first']);
    expect(cuePhrases('Cue')).toEqual([]);
    expect(cuePhrases(null)).toEqual([]);
  });
});

describe('unspokenCues', () => {
  const board = (captions?: Storyboard['captions']): Storyboard => ({
    id: 'test',
    fps: 30,
    width: 1920,
    height: 1080,
    maxSeconds: 60,
    transitionFrames: 10,
    leadIn: 12,
    tail: 12,
    gap: 6,
    voice: { speed: 1 },
    ...(captions === undefined ? {} : { captions }),
    scenes: [
      {
        id: 'hook',
        props: { punchCue: 'Few', missCue: 'Many', bothCue: 'shows' },
        vo: [
          { id: 'a', text: 'Every strategy shows a backtest.', say: 'Few' },
          { id: 'b', text: 'Few let you recompute it; it shows.' },
        ],
      },
    ],
  });

  it('accepts a cue heard in exactly one line and names the rest', () => {
    expect(unspokenCues(board())).toEqual(['hook: "Many"', 'hook: "shows"']);
  });

  it('matches a translated storyboard against the narration', () => {
    expect(
      unspokenCues(board({ lang: 'ja', relation: 'translation' })),
    ).toEqual(['hook: "Few"', 'hook: "Many"']);
  });
});
