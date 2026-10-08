'use client';
import { useEffect, useRef, useState } from 'react';
export function useAnimationFrame(
  callback: (now: number) => void,
  enabled = true,
): void {
  const latest = useRef(callback);
  latest.current = callback;
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    let frame: number;
    const tick = (now: number) => {
      latest.current(now);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [enabled]);
}
export function useThrottledFrame<T>(
  model: (now: number) => T,
  memoKey: (value: T) => string,
  initial: T,
  enabled = true,
): T {
  const [value, setValue] = useState(initial);
  const last = useRef(-Infinity);
  const key = useRef(memoKey(initial));
  useAnimationFrame((now) => {
    if (now - last.current < 30) {
      return;
    }
    last.current = now;
    const next = model(now);
    const nextKey = memoKey(next);
    if (nextKey !== key.current) {
      key.current = nextKey;
      setValue(next);
    }
  }, enabled);
  return value;
}
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return reduced;
}
