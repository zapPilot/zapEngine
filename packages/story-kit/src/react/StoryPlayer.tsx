'use client';
import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { assertCut, type Cut } from '../cut.js';
import { slideFromHash, slideHash } from '../hash.js';
import { deckCommand } from '../keys.js';
import { currentSlide, initialPlayback, playback } from '../playback.js';
import { FixedStage } from './FixedStage.js';
import { useAnimationFrame, useReducedMotion } from './hooks.js';
export interface StoryPlayerProps {
  cut: Cut;
  render: (time: number) => ReactNode;
  onStop?: (index: number) => void;
}
export function StoryPlayer({ cut, render, onStop }: StoryPlayerProps) {
  assertCut(cut);
  const [state, dispatch] = useReducer(
    (
      state: ReturnType<typeof initialPlayback>,
      action: Parameters<typeof playback>[1],
    ) => playback(state, action, cut),
    cut,
    initialPlayback,
  );
  const reduced = useReducedMotion();
  const [printing, setPrinting] = useState(false);
  const lastRender = useRef(-Infinity);
  const index = currentSlide(state, cut);
  useAnimationFrame(
    (now) => {
      if (now - lastRender.current < 30) {
        return;
      }
      lastRender.current = now;
      dispatch({ type: 'tick', now });
    },
    state.playing || state.tween !== null,
  );
  useEffect(() => {
    if (reduced) {
      dispatch({ type: 'reduced' });
    }
  }, [reduced]);
  useEffect(() => {
    const readHash = () => {
      const slide = slideFromHash(window.location.hash, cut.stops.length);
      if (slide !== null) {
        dispatch({
          type: 'go',
          index: slide,
          now: performance.now(),
          immediate: true,
        });
      }
    };
    readHash();
    window.addEventListener('hashchange', readHash);
    return () => window.removeEventListener('hashchange', readHash);
  }, [cut]);
  useEffect(() => {
    if (state.mode === 'deck') {
      window.history.replaceState(null, '', slideHash(index));
    }
    onStop?.(index);
  }, [index, state.mode, onStop]);
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
  const command = (command: NonNullable<ReturnType<typeof deckCommand>>) =>
    dispatch({ type: 'command', command, now: performance.now() });
  const frames = Math.floor(state.time * cut.fps + 0.000001);
  const pad = (n: number) => String(n).padStart(2, '0');
  const timecode = `${pad(Math.floor(frames / (cut.fps * 60)))}:${pad(Math.floor(frames / cut.fps) % 60)}:${pad(frames % cut.fps)}`;
  return (
    <div
      className="sk-player"
      tabIndex={0}
      onKeyDown={(event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.closest(
            'input, textarea, select, [contenteditable="true"]',
          )
        ) {
          return;
        }
        const action = deckCommand(event.key);
        if (action) {
          event.preventDefault();
          command(action);
        }
      }}
    >
      <div className="sk-screen">
        <FixedStage width={cut.width} height={cut.height}>
          {render(state.time)}
        </FixedStage>
      </div>
      <div className="sk-controls" role="group" aria-label="Playback">
        <div role="group" aria-label="Mode">
          {(['film', 'deck'] as const).map((mode) => (
            <button
              type="button"
              key={mode}
              aria-pressed={state.mode === mode}
              onClick={() =>
                dispatch({ type: 'mode', mode, now: performance.now() })
              }
            >
              {mode === 'film' ? 'Film' : 'Deck'}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Previous slide"
          onClick={() => command('prev')}
        >
          ←
        </button>
        <button
          type="button"
          aria-label={state.playing ? 'Pause' : 'Play'}
          onClick={() => command('toggle')}
        >
          {state.playing ? 'Ⅱ' : '▶'}
        </button>
        <button
          type="button"
          aria-label="Next slide"
          onClick={() => command('next')}
        >
          →
        </button>
        <div className="sk-scrubber">
          {cut.stops.map((stop) => (
            <span
              key={stop.id}
              className="sk-stop"
              aria-hidden="true"
              style={{ left: `${(stop.time / cut.duration) * 100}%` }}
            />
          ))}
          <input
            type="range"
            aria-label="Timeline"
            aria-valuetext={timecode}
            min={0}
            max={cut.duration}
            step={1 / cut.fps}
            value={state.time}
            onChange={(event) =>
              dispatch({ type: 'scrub', time: Number(event.target.value) })
            }
          />
        </div>
        <output>{timecode}</output>
        <span>
          {state.mode === 'deck' ? 'Slide' : 'Scene'} {pad(index + 1)} /{' '}
          {pad(cut.stops.length)}
        </span>
      </div>
      {printing && (
        <div className="sk-print">
          <style>{`@page { size: ${cut.width}px ${cut.height}px; margin: 0; }`}</style>
          {cut.stops.map((stop) => (
            <div className="sk-print-page" key={stop.id}>
              <FixedStage width={cut.width} height={cut.height}>
                {render(stop.time)}
              </FixedStage>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
