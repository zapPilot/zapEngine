import type { CSSProperties, FC, ReactNode } from 'react';
import { Img, staticFile } from 'remotion';

import { Slices } from '../../../primitives/Slices';
import { theme } from '../../kokode-clinic/theme';

/**
 * The KOKODE device as an illustration: a compact rounded slab, never a real
 * product. Its top face is the element (width × depth px); the body extends
 * `height` px behind it, so a rig tilts it back to show the front edge.
 */
export const BOX = { width: 620, depth: 460, height: 120, radius: 70 } as const;

/** Top-face centre and status light, for camera focus points. */
export const BOX_CENTRE = { fx: BOX.width / 2, fy: BOX.depth / 2 } as const;
export const BOX_LIGHT = { fx: BOX.width / 2, fy: BOX.depth - 34 } as const;

const SLICES = 36;
const WALL = ['#9fa0a6', '#b6b7bc', '#c9cacf', '#d9dade', '#e6e7ea'];

export const KokodeBox: FC<{
  /** Angle (deg) the brushed top and the walls catch the light at. */
  readonly light?: number;
  /** Status light, 0 (off) – 1 (lit). */
  readonly glow?: number;
  /** Laid on the top face, in its coordinates (e.g. layers landing on it). */
  readonly children?: ReactNode;
  readonly style?: CSSProperties;
}> = ({ light = 0, glow = 1, children, style }) => {
  const sheen = 46 + light * 1.3;
  return (
    <div
      style={{
        position: 'absolute',
        width: BOX.width,
        height: BOX.depth,
        transformStyle: 'preserve-3d',
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 30,
          top: 40,
          width: BOX.width - 60,
          height: BOX.depth - 60,
          borderRadius: BOX.radius,
          background: 'rgba(22, 22, 23, 0.42)',
          filter: 'blur(40px)',
          transform: `translateZ(${-BOX.height - 60}px)`,
        }}
      />
      <Slices
        count={SLICES}
        depth={BOX.height}
        radius={BOX.radius}
        colors={WALL}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: BOX.radius,
          background: `linear-gradient(${125 + light}deg, #e4e5e8 0%, #fbfbfc ${sheen - 18}%, #e9eaed ${sheen}%, #ffffff ${sheen + 16}%, #dcdde1 100%)`,
          boxShadow:
            'inset 0 0 0 1.5px rgba(255, 255, 255, 0.9), inset 0 -10px 24px rgba(0, 0, 0, 0.05)',
          transform: 'translateZ(0.5px)',
          transformStyle: 'preserve-3d',
        }}
      >
        <Img
          src={staticFile('brand/kokode-mark.svg')}
          style={{
            position: 'absolute',
            left: BOX.width / 2 - 64,
            top: BOX.depth / 2 - 76,
            width: 128,
            height: 128,
            opacity: 0.88,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: BOX_LIGHT.fx - 90,
            top: BOX_LIGHT.fy - 4,
            width: 180,
            height: 8,
            borderRadius: 4,
            background: glow > 0 ? theme.blue : '#c7c7cc',
            opacity: 0.35 + glow * 0.65,
            boxShadow: `0 0 ${18 * glow}px ${6 * glow}px rgba(0, 113, 227, ${0.45 * glow})`,
          }}
        />
        {children}
      </div>
    </div>
  );
};
