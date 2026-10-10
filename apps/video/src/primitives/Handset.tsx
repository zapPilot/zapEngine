import type { CSSProperties, ReactNode } from 'react';

import { Slices } from './Slices';

/** A modern handset around a 402×874 screen, in CSS px. */
export const HANDSET = {
  screen: { width: 402, height: 874, radius: 56 },
  bezel: 13,
  rim: 4,
  depth: 30,
} as const;

const INSET = HANDSET.bezel + HANDSET.rim;
const BODY = {
  width: HANDSET.screen.width + INSET * 2,
  height: HANDSET.screen.height + INSET * 2,
  radius: HANDSET.screen.radius + INSET,
} as const;

/** Where the screen starts inside the body, for `rigStyle`'s inset. */
export const HANDSET_SCREEN = { x: INSET, y: INSET } as const;

const SLICES = 15;
const EDGE = ['#d3d3d7', '#bcbcc1', '#a5a5aa', '#929297', '#7f7f84'];

/**
 * The handset. Its thickness is stacked slices in `translateZ`; the rim and
 * the glass glare follow `light`, the angle (deg) the body is turned to.
 */
export function Handset({
  children,
  dark = false,
  light = 0,
  shadow = true,
  style,
}: {
  readonly children: ReactNode;
  readonly dark?: boolean;
  readonly light?: number;
  readonly shadow?: boolean;
  readonly style?: CSSProperties;
}) {
  const sheen = 50 + light * 1.6;
  const { screen } = HANDSET;
  return (
    <div
      style={{
        position: 'absolute',
        width: BODY.width,
        height: BODY.height,
        transformStyle: 'preserve-3d',
        ...style,
      }}
    >
      {shadow ? (
        <div
          style={{
            position: 'absolute',
            left: 40,
            top: 70,
            width: BODY.width - 80,
            height: BODY.height - 80,
            borderRadius: BODY.radius,
            background: 'rgba(22, 22, 23, 0.36)',
            filter: 'blur(46px)',
            transform: `translateZ(${-HANDSET.depth - 70}px)`,
          }}
        />
      ) : null}
      <Slices
        count={SLICES}
        depth={HANDSET.depth}
        radius={BODY.radius}
        colors={EDGE}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          padding: HANDSET.rim,
          borderRadius: BODY.radius,
          background: `linear-gradient(${120 + light}deg, #8d8d92 0%, #ececee ${sheen - 22}%, #aaaaaf ${sheen}%, #f4f4f6 ${sheen + 18}%, #8f8f94 100%)`,
          transform: 'translateZ(0.5px)',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            padding: HANDSET.bezel,
            borderRadius: BODY.radius - HANDSET.rim,
            background: '#050506',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: screen.width,
              height: screen.height,
              borderRadius: screen.radius,
              overflow: 'hidden',
              background: dark ? '#000000' : '#ffffff',
            }}
          >
            {children}
            <div
              style={{
                position: 'absolute',
                top: 11,
                left: (screen.width - 126) / 2,
                width: 126,
                height: 37,
                borderRadius: 19,
                background: '#000000',
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: 8,
                left: (screen.width - 140) / 2,
                width: 140,
                height: 5,
                borderRadius: 3,
                background: dark
                  ? 'rgba(255, 255, 255, 0.85)'
                  : 'rgba(0, 0, 0, 0.82)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: `linear-gradient(${112 + light * 0.6}deg, rgba(255, 255, 255, 0) ${sheen - 30}%, rgba(255, 255, 255, 0.13) ${sheen - 12}%, rgba(255, 255, 255, 0) ${sheen + 6}%)`,
                pointerEvents: 'none',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
