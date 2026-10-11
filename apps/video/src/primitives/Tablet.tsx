import type { CSSProperties, ReactNode } from 'react';

/** An 11-inch class tablet held in landscape around a 1194×834 screen. */
export const TABLET = {
  width: 1194,
  height: 834,
  bezel: 22,
  rim: 3,
  radius: 24,
} as const;

/** Where the screen starts inside the body, for `rigStyle`'s inset. */
export const TABLET_SCREEN = {
  x: TABLET.bezel + TABLET.rim,
  y: TABLET.bezel + TABLET.rim,
} as const;

/** A tablet whose aluminium edge catches the light at angle `light` (deg). */
export function Tablet({
  children,
  light = 0,
  style,
}: {
  readonly children: ReactNode;
  readonly light?: number;
  readonly style?: CSSProperties;
}) {
  const inset = TABLET.bezel + TABLET.rim;
  const sheen = 45 + light * 1.4;
  return (
    <div
      style={{
        position: 'absolute',
        width: TABLET.width + inset * 2,
        height: TABLET.height + inset * 2,
        padding: TABLET.rim,
        boxSizing: 'border-box',
        borderRadius: TABLET.radius + inset,
        background: `linear-gradient(${135 + light}deg, #9d9da2, #ececee ${sheen - 10}%, #a9a9ae ${sheen + 5}%, #dcdce0)`,
        boxShadow:
          '0 40px 80px rgba(0, 0, 0, 0.18), 0 8px 18px rgba(0, 0, 0, 0.10)',
        ...style,
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          padding: TABLET.bezel,
          boxSizing: 'border-box',
          borderRadius: TABLET.radius + TABLET.bezel,
          background: '#0b0b0c',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: TABLET.width,
            height: TABLET.height,
            borderRadius: TABLET.radius,
            overflow: 'hidden',
            background: '#ffffff',
          }}
        >
          {children}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(${112 + light * 0.6}deg, rgba(255, 255, 255, 0) ${sheen - 30}%, rgba(255, 255, 255, 0.12) ${sheen - 12}%, rgba(255, 255, 255, 0) ${sheen + 6}%)`,
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>
    </div>
  );
}
