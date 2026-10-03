import type React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';

import { color } from '../brand/tokens';

// landing.css `.shell-root`: a warm glow top right, a cool one at left, on
// near-black. The glow drifts a few percent over the whole video so held
// frames never look frozen.
export const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const drift = frame / Math.max(1, durationInFrames);
  return (
    <AbsoluteFill
      style={{
        background: [
          `radial-gradient(ellipse 70% 42% at ${78 - drift * 10}% ${12 + drift * 8}%, rgba(212, 197, 163, 0.09), transparent 68%)`,
          `radial-gradient(ellipse 48% 34% at ${12 + drift * 6}% 58%, rgba(39, 117, 202, 0.06), transparent 70%)`,
          color.bg,
        ].join(', '),
      }}
    />
  );
};

const GRAIN = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.06 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`;

/** The site's film grain, laid over everything below the captions. */
export const Grain: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundImage: GRAIN,
      opacity: 0.5,
      mixBlendMode: 'overlay',
      pointerEvents: 'none',
    }}
  />
);
