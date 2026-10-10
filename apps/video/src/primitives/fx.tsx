import type { ReactNode } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

/** On an impact the frame jolts and settles: a damped shake, over in half a second. */
export function Shake({
  at,
  strength = 14,
  children,
}: {
  readonly at: number;
  readonly strength?: number;
  readonly children: ReactNode;
}) {
  const frame = useCurrentFrame();
  const t = frame - at;
  const amount = t < 0 || t > 14 ? 0 : strength * Math.exp(-t / 4);
  return (
    <AbsoluteFill
      style={{
        translate: `${(Math.sin(t * 2.3) * amount).toFixed(2)}px ${(Math.cos(t * 3.1) * amount * 0.6).toFixed(2)}px`,
        transformStyle: 'preserve-3d',
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

/** A flash that blooms on an impact and is gone in a few frames. */
export function Flash({
  at,
  peak = 0.55,
  color = '#ffffff',
}: {
  readonly at: number;
  readonly peak?: number;
  readonly color?: string;
}) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [at, at + 1, at + 8], [0, peak, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return opacity > 0 ? (
    <AbsoluteFill style={{ background: color, opacity }} />
  ) : null;
}
