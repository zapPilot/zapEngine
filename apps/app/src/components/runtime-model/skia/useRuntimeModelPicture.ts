import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Skia,
  useFonts,
  type DataModule,
  type SkPicture,
} from '@shopify/react-native-skia';
import {
  buildDrawList,
  engineFrame,
  type EngineLayer,
} from '@zapengine/zap-pilot-story/model';
import { APP_FONTS } from '@/lib/fonts';
import type { RuntimeModelSpec } from '../runtimeModelSpec';
import {
  FRAME_INTERVAL_MS,
  LOOPING,
  LOOP_SECONDS,
  assemblyView,
  restingView,
  sameView,
  type AssemblyView,
} from '../runtimeModelTimeline';
import { SKIA_MONO_FAMILIES, createSkiaRecorder } from './recorder';

// Metro resolves `.ttf` imports to asset ids; the shared declaration types them as web URLs.
const asset = (module: string) => module as unknown as DataModule;
/** Skia cannot see expo-font registrations, so it loads the same TTFs itself. */
const SKIA_FONTS = Object.fromEntries(
  SKIA_MONO_FAMILIES.map((family) => [family, [asset(APP_FONTS[family])]]),
);
const STILL_LAYERS: readonly EngineLayer[] = ['faces', 'dial', 'dots'];
const LOOP_FRAMES = (LOOP_SECONDS * 1000) / FRAME_INTERVAL_MS;
/**
 * The loop is sampled on its own frame grid, so every loop after the first
 * replays the same views from cache instead of re-running the depth sort.
 * One 12 s loop at 30 ms holds 181 distinct views.
 */
const PICTURE_LIMIT = 200;
const loopSeconds = (elapsed: number) =>
  ((Math.floor((elapsed * 1000) / FRAME_INTERVAL_MS) % LOOP_FRAMES) *
    FRAME_INTERVAL_MS) /
  1000;

function layoutOf(spec: RuntimeModelSpec) {
  return {
    width: spec.width,
    height: spec.height,
    unit: spec.unit,
    origin: [spec.origin.x, spec.origin.y] as const,
    perspectiveOrigin: [spec.pivot.x, spec.pivot.y] as const,
  };
}

/**
 * Records the runtime model as Skia pictures: engine frame, projection, depth
 * order, drawing list, picture. First Run loops on the JS thread at the shared
 * frame interval and skips holding frames; Runtime and reduced motion record
 * their resting view once.
 */
export function useRuntimeModelPicture(
  spec: RuntimeModelSpec,
  pinLabels: Readonly<Record<string, string>>,
  reducedMotion: boolean,
  paused: boolean,
): SkPicture | null {
  const fonts = useFonts(SKIA_FONTS);
  const labels = JSON.stringify(pinLabels);
  const draw = useMemo(() => {
    if (fonts === null) return null;
    const recorder = createSkiaRecorder(Skia, fonts);
    const options = {
      layout: layoutOf(spec),
      measure: recorder.measure,
      pinLabels: JSON.parse(labels) as Record<string, string>,
      ...(spec.layers === 'full' ? {} : { layers: STILL_LAYERS }),
    };
    const pictures = new Map<string, SkPicture>();
    return (view: AssemblyView): SkPicture => {
      const key = `${view.time}|${view.ambient}`;
      const hit = pictures.get(key);
      if (hit !== undefined) return hit;
      const picture = recorder.record(
        buildDrawList(engineFrame(view.time, view.ambient), options),
      );
      if (pictures.size >= PICTURE_LIMIT) {
        pictures.delete(pictures.keys().next().value!);
      }
      pictures.set(key, picture);
      return picture;
    };
  }, [fonts, spec, labels]);
  const [picture, setPicture] = useState<SkPicture | null>(null);
  const looping = LOOPING[spec.variant] && !reducedMotion;
  // Advances only while running, so a paused loop resumes where it stopped.
  const elapsed = useRef(0);

  useEffect(() => {
    if (draw === null || looping) return;
    const request = requestAnimationFrame(() =>
      setPicture(draw(restingView(spec.variant))),
    );
    return () => cancelAnimationFrame(request);
  }, [draw, looping, spec.variant]);

  useEffect(() => {
    if (draw === null || !looping || paused) return;
    let previous: number | undefined;
    let due = -Infinity;
    let shown: AssemblyView | undefined;
    let request = requestAnimationFrame(function tick(now) {
      request = requestAnimationFrame(tick);
      if (previous !== undefined) elapsed.current += (now - previous) / 1000;
      previous = now;
      if (now < due) return;
      due = now + FRAME_INTERVAL_MS;
      const view = assemblyView(loopSeconds(elapsed.current));
      if (shown !== undefined && sameView(shown, view)) return;
      shown = view;
      const started = performance.now();
      setPicture(draw(view));
      // An uncached frame can cost more than the interval; leave the JS thread at
      // least as long idle before drawing the next one.
      due = Math.max(due, now + 2 * (performance.now() - started));
    });
    return () => cancelAnimationFrame(request);
  }, [draw, looping, paused]);

  return picture;
}
