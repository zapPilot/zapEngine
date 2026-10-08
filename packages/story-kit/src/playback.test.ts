import { expect, it } from 'vitest';
import { cut } from './test/fixtures.js';
import {
  currentSlide,
  initialPlayback,
  playback,
  type PlaybackState,
} from './index.js';
const reduce = (state: PlaybackState, action: Parameters<typeof playback>[1]) =>
  playback(state, action, cut);
it('caps frame deltas, wraps film and resets to a reduced-motion poster', () => {
  let state = initialPlayback(cut);
  state = reduce(state, { type: 'tick', now: 0 });
  state = reduce(state, { type: 'tick', now: 10000 });
  expect(state.time).toBeCloseTo(0.1);
  expect(
    reduce({ ...state, time: 47.95 }, { type: 'tick', now: 11000 }).time,
  ).toBeCloseTo(0.05);
  expect(reduce(state, { type: 'tick', now: 1 }).time).toBeCloseTo(0.1);
  const reduced = reduce(state, { type: 'reduced' });
  expect(reduced).toEqual(initialPlayback(cut, true));
  expect(reduce(reduced, { type: 'tick', now: 12000 }).time).toBe(20.5);
});
it('enters deck at the closest stop, tweens over 900ms and wraps navigation', () => {
  let state = reduce(
    { ...initialPlayback(cut), time: 22 },
    { type: 'mode', mode: 'deck', now: 0 },
  );
  expect(currentSlide(state, cut)).toBe(1);
  state = reduce(state, { type: 'tick', now: 450 });
  expect(state.time).toBe(21.25);
  expect(state.tween).not.toBeNull();
  state = reduce(state, { type: 'tick', now: 900 });
  expect(state.time).toBe(20.5);
  expect(state.tween).toBeNull();
  state = reduce(state, { type: 'go', index: -1, now: 1000, immediate: true });
  expect(state.time).toBe(46);
  expect(reduce(state, { type: 'mode', mode: 'film', now: 1000 }).playing).toBe(
    true,
  );
  expect(
    reduce(initialPlayback(cut), { type: 'mode', mode: 'deck', now: 0 }).slide,
  ).toBe(0);
});
it('implements previous tolerance, first/last, scrubbing and toggle semantics', () => {
  const film = { ...initialPlayback(cut), time: 21 };
  expect(currentSlide(film, cut)).toBe(1);
  expect(reduce(film, { type: 'command', command: 'prev', now: 0 }).slide).toBe(
    1,
  );
  expect(
    reduce(
      { ...film, time: 20.6 },
      { type: 'command', command: 'prev', now: 0 },
    ).slide,
  ).toBe(0);
  const deck = reduce(film, { type: 'go', index: 1, now: 0 });
  expect(reduce(deck, { type: 'command', command: 'prev', now: 0 }).slide).toBe(
    0,
  );
  expect(reduce(deck, { type: 'command', command: 'next', now: 0 }).slide).toBe(
    2,
  );
  expect(
    reduce(deck, { type: 'command', command: 'first', now: 0 }).slide,
  ).toBe(0);
  expect(reduce(deck, { type: 'command', command: 'last', now: 0 }).slide).toBe(
    2,
  );
  expect(
    reduce(film, { type: 'command', command: 'toggle', now: 0 }).playing,
  ).toBe(false);
  expect(
    reduce(deck, { type: 'command', command: 'toggle', now: 0 }),
  ).toMatchObject({ mode: 'film', playing: true, tween: null });
  expect(reduce(deck, { type: 'scrub', time: 99 })).toMatchObject({
    time: 48,
    playing: false,
    tween: null,
    slide: null,
  });
  expect(currentSlide(initialPlayback(cut), cut)).toBe(0);
});

it('rejects unknown actions from untyped hosts', () => {
  expect(() =>
    reduce(initialPlayback(cut), { type: 'unknown' } as unknown as Parameters<
      typeof playback
    >[1]),
  ).toThrow('Unknown playback action');
});
