import '@zapengine/zap-pilot-story/engine.css';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { EngineWorld } from '@zapengine/zap-pilot-story/engine-world';
import { tokens } from '@zapengine/design-tokens/tokens';
import type {
  RuntimeModelCanvasProps,
  RuntimeModelSpec,
} from './runtimeModelSpec';
import {
  FRAME_INTERVAL_MS,
  LOOPING,
  assemblyView,
  restingView,
  sameView,
  type AssemblyView,
} from './runtimeModelTimeline';

const LAYERS = {
  full: ['faces', 'dial', 'dots', 'tags', 'pins'],
  'faces-dial-dots': ['faces', 'dial', 'dots'],
} as const;

/** Advances only while running, so a paused loop resumes where it stopped. */
function useAssemblyView(running: boolean): AssemblyView {
  const elapsed = useRef(0);
  const [view, setView] = useState(() => assemblyView(0));
  useEffect(() => {
    if (!running) return;
    let previous: number | undefined;
    let painted = -Infinity;
    let request = requestAnimationFrame(function tick(now) {
      request = requestAnimationFrame(tick);
      if (previous !== undefined) elapsed.current += (now - previous) / 1000;
      previous = now;
      if (now - painted < FRAME_INTERVAL_MS) return;
      painted = now;
      const next = assemblyView(elapsed.current);
      setView((current) => (sameView(current, next) ? current : next));
    });
    return () => cancelAnimationFrame(request);
  }, [running]);
  return view;
}

const cssVariables = (
  prefix: string,
  roles: Readonly<Record<string, string>>,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(roles).map(([role, value]) => [`--${prefix}${role}`, value]),
  );

/** The night roles `engine.css` reads, normally supplied by `[data-theme]`. */
const NIGHT_THEME = {
  ...cssVariables('', tokens.mode.night),
  ...cssVariables('sleeve-', tokens.sleeve.night),
  ...cssVariables('material-', tokens.material.night),
  '--font-mono': `"${tokens.font.native['mono-medium'].family}", ${tokens.font.mono.fallback}`,
};

function stageStyle(spec: RuntimeModelSpec): CSSProperties {
  return {
    ...NIGHT_THEME,
    // Not `.zp-stage`: its container query hides pins and overrides --zp-u.
    '--zp-u': `${spec.unit}px`,
    '--zp-frame-x': '0px',
    position: 'relative',
    width: spec.width,
    height: spec.height,
    overflow: 'hidden',
    isolation: 'isolate',
  } as CSSProperties;
}

/** Web renders the landing's DOM stage: CSS 3D transforms over `engine.css`. */
export function RuntimeModelCanvas({
  spec,
  pinLabels,
  reducedMotion,
  paused,
}: RuntimeModelCanvasProps) {
  const looping = LOOPING[spec.variant] && !reducedMotion;
  const animated = useAssemblyView(looping && !paused);
  const shown = looping ? animated : restingView(spec.variant);
  return (
    <div style={stageStyle(spec)}>
      <EngineWorld
        time={shown.time}
        ambient={shown.ambient}
        veil={false}
        layers={LAYERS[spec.layers]}
        origin={[spec.origin.x, spec.origin.y]}
        perspectiveOrigin={[spec.pivot.x, spec.pivot.y]}
        pinLabels={pinLabels}
      />
    </div>
  );
}
