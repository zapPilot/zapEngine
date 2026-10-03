import { describe, expect, it } from 'vitest';

import type { VoManifest } from './manifest';
import { buildTimeline, ESTIMATED_CHARS_PER_SECOND } from './timeline';
import type { SceneSpec, Storyboard } from './types';

const scene = (
  id: string,
  lines: string[],
  extra: Partial<SceneSpec> = {},
): SceneSpec => ({
  id,
  props: {},
  vo: lines.map((text, index) => ({ id: `${id}-${index}`, text })),
  ...extra,
});

const board = (
  scenes: SceneSpec[],
  extra: Partial<Storyboard> = {},
): Storyboard => ({
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
  scenes,
  ...extra,
});

const manifest = (lines: Record<string, number>): VoManifest => ({
  videoId: 'test',
  engine: 'e',
  voiceKey: 'k',
  lines: Object.fromEntries(
    Object.entries(lines).map(([id, seconds]) => [
      id,
      { file: `vo/test/${id}.mp3`, fingerprint: id, durationSeconds: seconds },
    ]),
  ),
});

describe('buildTimeline', () => {
  it('sizes scenes from narration and overlaps them by the transition', () => {
    const timeline = buildTimeline(
      board([
        scene('a', ['One.', 'Two.']),
        scene('b', ['Three.'], { leadIn: 20, tail: 30 }),
      ]),
      manifest({ 'a-0': 1, 'a-1': 0.5, 'b-0': 2 }),
    );
    // a: 12 lead + 30 + 6 gap + 15 + 12 tail = 75; b: 20 + 60 + 30 = 110.
    expect(timeline.scenes.map((s) => [s.from, s.durationInFrames])).toEqual([
      [0, 75],
      [65, 110],
    ]);
    expect(timeline.durationInFrames).toBe(175);
    expect(
      timeline.scenes[0]?.beats.map((b) => [
        b.from,
        b.durationInFrames,
        b.file,
      ]),
    ).toEqual([
      [12, 30, 'vo/test/a-0.mp3'],
      [48, 15, 'vo/test/a-1.mp3'],
    ]);
    expect(timeline.voice).toEqual([
      {
        lineId: 'a-0',
        file: 'vo/test/a-0.mp3',
        from: 12,
        durationInFrames: 30,
      },
      {
        lineId: 'a-1',
        file: 'vo/test/a-1.mp3',
        from: 48,
        durationInFrames: 15,
      },
      {
        lineId: 'b-0',
        file: 'vo/test/b-0.mp3',
        from: 85,
        durationInFrames: 60,
      },
    ]);
    expect(timeline.estimatedLines).toEqual([]);
  });

  it('bridges captions across short pauses and places them absolutely', () => {
    const timeline = buildTimeline(
      board([
        scene('a', ['One.', 'Two.']),
        scene('b', ['Three.'], { leadIn: 20, tail: 30 }),
      ]),
      manifest({ 'a-0': 1, 'a-1': 0.5, 'b-0': 2 }),
    );
    expect(timeline.captions).toEqual([
      { text: 'One.', from: 12, to: 48 },
      { text: 'Two.', from: 48, to: 63 },
      { text: 'Three.', from: 85, to: 145 },
    ]);
  });

  it('estimates lines with no narration yet and flags them', () => {
    const text = 'x'.repeat(ESTIMATED_CHARS_PER_SECOND * 2);
    const timeline = buildTimeline(board([scene('a', [text])]), manifest({}));
    expect(timeline.estimatedLines).toEqual(['a-0']);
    expect(timeline.voice).toEqual([]);
    expect(timeline.scenes[0]?.beats[0]).toMatchObject({
      file: null,
      durationInFrames: 60,
    });
  });

  it('sizes an estimate by the spoken override when there is one', () => {
    const timeline = buildTimeline(
      board([
        {
          id: 'a',
          props: {},
          vo: [{ id: 'l', text: 'x', say: 'y'.repeat(30) }],
        },
      ]),
      manifest({}),
    );
    expect(timeline.scenes[0]?.beats[0]?.durationInFrames).toBe(60);
  });

  it('honours minFrames and never makes a scene shorter than two transitions', () => {
    const timeline = buildTimeline(
      board([scene('a', [], { minFrames: 90 }), scene('b', [])]),
      manifest({}),
    );
    expect(timeline.scenes.map((s) => s.durationInFrames)).toEqual([90, 24]);
  });

  it('rejects duplicate line ids', () => {
    expect(() =>
      buildTimeline(
        board([
          scene('a', ['x']),
          { id: 'b', props: {}, vo: [{ id: 'a-0', text: 'y' }] },
        ]),
        manifest({}),
      ),
    ).toThrow('Duplicate voiceover line id "a-0".');
  });

  it('rejects narration that would overlap across a transition', () => {
    expect(() =>
      buildTimeline(
        board([scene('a', ['One.']), scene('b', ['Two.'])], {
          leadIn: 2,
          tail: 2,
          transitionFrames: 10,
        }),
        manifest({ 'a-0': 1, 'b-0': 1 }),
      ),
    ).toThrow('Narration "b-0" starts before "a-0" ends');
  });
});
