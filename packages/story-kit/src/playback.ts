import { clamp, easeInOutCubic, lerp, wrap } from './timeline.js';
import type { DeckCommand } from './keys.js';
export interface PlaybackCut {
  duration: number;
  poster: number;
  stops: readonly { time: number }[];
}
export interface PlaybackState {
  time: number;
  playing: boolean;
  mode: 'film' | 'deck';
  slide: number | null;
  tween: { from: number; to: number; start: number } | null;
  lastNow: number | null;
}
export type PlaybackAction =
  | { type: 'tick'; now: number }
  | { type: 'mode'; mode: 'film' | 'deck'; now: number }
  | { type: 'go'; index: number; now: number; immediate?: boolean }
  | { type: 'command'; command: DeckCommand; now: number }
  | { type: 'scrub'; time: number }
  | { type: 'reduced' };
export const initialPlayback = (
  cut: PlaybackCut,
  reduced = false,
): PlaybackState => ({
  time: reduced ? cut.poster : 0,
  playing: !reduced,
  mode: 'film',
  slide: null,
  tween: null,
  lastNow: null,
});
export function currentSlide(state: PlaybackState, cut: PlaybackCut): number {
  if (state.mode === 'deck' && state.slide !== null) {
    return state.slide;
  }
  let index = 0;
  cut.stops.forEach((stop, i) => {
    if (stop.time <= state.time + 0.02) {
      index = i;
    }
  });
  return index;
}
function go(
  state: PlaybackState,
  cut: PlaybackCut,
  index: number,
  now: number,
  immediate = false,
): PlaybackState {
  const slide = wrap(index, cut.stops.length);
  const to = cut.stops[slide]!.time;
  return {
    ...state,
    mode: 'deck',
    slide,
    playing: false,
    time: immediate ? to : state.time,
    tween: immediate ? null : { from: state.time, to, start: now },
  };
}
export function playback(
  state: PlaybackState,
  action: PlaybackAction,
  cut: PlaybackCut,
): PlaybackState {
  switch (action.type) {
    case 'tick': {
      const dt =
        state.lastNow === null
          ? 0
          : clamp((action.now - state.lastNow) / 1000, 0, 0.1);
      const next = { ...state, lastNow: action.now };
      if (state.tween) {
        const q = clamp((action.now - state.tween.start) / 900);
        return {
          ...next,
          time: lerp(state.tween.from, state.tween.to, easeInOutCubic(q)),
          tween: q === 1 ? null : state.tween,
        };
      }
      return state.playing
        ? { ...next, time: wrap(state.time + dt, cut.duration) }
        : next;
    }
    case 'reduced':
      return initialPlayback(cut, true);
    case 'scrub':
      return {
        ...state,
        time: clamp(action.time, 0, cut.duration),
        playing: false,
        slide: null,
        tween: null,
      };
    case 'go':
      return go(state, cut, action.index, action.now, action.immediate);
    case 'mode': {
      if (action.mode === 'film') {
        return {
          ...state,
          mode: 'film',
          playing: true,
          slide: null,
          tween: null,
          lastNow: null,
        };
      }
      let best = 0;
      cut.stops.forEach((stop, i) => {
        if (
          Math.abs(stop.time - state.time) <
          Math.abs(cut.stops[best]!.time - state.time)
        ) {
          best = i;
        }
      });
      return go(state, cut, best, action.now);
    }
    case 'command': {
      if (action.command === 'toggle') {
        return state.playing
          ? { ...state, playing: false }
          : {
              ...state,
              mode: 'film',
              playing: true,
              slide: null,
              tween: null,
              lastNow: null,
            };
      }
      const index = currentSlide(state, cut);
      const previous =
        state.mode === 'film' && state.time > cut.stops[index]!.time + 0.3
          ? index
          : index - 1;
      const target =
        action.command === 'first'
          ? 0
          : action.command === 'last'
            ? cut.stops.length - 1
            : action.command === 'prev'
              ? previous
              : index + 1;
      return go(state, cut, target, action.now);
    }
  }
  throw new Error('Unknown playback action');
}
