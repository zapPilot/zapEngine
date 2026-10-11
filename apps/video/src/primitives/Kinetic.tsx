import type { CSSProperties, ReactNode } from 'react';
import { Easing, interpolate, useCurrentFrame } from 'remotion';

import { pieces } from './text';

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const outExpo = Easing.bezier(0.16, 1, 0.3, 1);
const inQuint = Easing.bezier(0.64, 0, 0.78, 0);

export interface TextLook {
  readonly font: string;
  readonly size: number;
  readonly weight?: number;
  readonly color?: string;
  /** Letter spacing in em. */
  readonly tracking?: number;
  readonly lineHeight?: number;
}

const look = ({
  font,
  size,
  weight = 800,
  color,
  tracking = -0.035,
  lineHeight = 1.12,
}: TextLook): CSSProperties => ({
  fontFamily: font,
  fontSize: size,
  fontWeight: weight,
  color,
  letterSpacing: `${tracking}em`,
  lineHeight,
  whiteSpace: 'pre',
});

/**
 * Words (or CJK characters) rise out of a mask one after another, and with
 * `exit` leave the same way upwards. The workhorse of kinetic headlines.
 */
interface KineticProps {
  readonly text: string;
  /** Frame the text lands. */
  readonly at: number;
  /** Frame it starts to leave; absent, it stays. */
  readonly exit?: number;
  readonly look: TextLook;
  readonly style?: CSSProperties;
}

export function Rise({
  text,
  at,
  stagger = 2,
  duration = 16,
  exit,
  look: textLook,
  style,
}: KineticProps & {
  readonly stagger?: number;
  readonly duration?: number;
}) {
  const frame = useCurrentFrame();
  return (
    <div style={{ ...look(textLook), ...style }}>
      {pieces(text).map((part, i) => {
        const start = at + i * stagger;
        const inT = interpolate(frame, [start, start + duration], [0, 1], {
          ...CLAMP,
          easing: outExpo,
        });
        const outT =
          exit === undefined
            ? 0
            : interpolate(frame, [exit + i, exit + i + 10], [0, 1], {
                ...CLAMP,
                easing: inQuint,
              });
        return (
          <span
            // Pieces repeat ("the … the"), so the index disambiguates.
            key={`${i}-${part}`}
            style={{
              display: 'inline-block',
              overflow: 'hidden',
              verticalAlign: 'top',
              whiteSpace: 'pre',
              paddingBottom: '0.08em',
              marginBottom: '-0.08em',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                translate: `0px ${(1 - inT) * 105 - outT * 105}%`,
                rotate: `${(1 - inT) * 4}deg`,
              }}
            >
              {part}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** A line that lands hard on its frame: oversized and blurred, then snapped in. */
export function Slam({ text, at, exit, look: textLook, style }: KineticProps) {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [at - 3, at + 7], [0, 1], {
    ...CLAMP,
    easing: Easing.out(Easing.back(1.6)),
  });
  const fade = interpolate(frame, [at - 3, at], [0, 1], CLAMP);
  const gone =
    exit === undefined
      ? 0
      : interpolate(frame, [exit, exit + 6], [0, 1], {
          ...CLAMP,
          easing: inQuint,
        });
  return (
    <div
      style={{
        ...look(textLook),
        opacity: fade * (1 - gone),
        scale: 1.6 - 0.6 * t + gone * 0.3,
        filter: `blur(${(1 - Math.min(1, t)) * 14 + gone * 10}px)`,
        ...style,
      }}
    >
      {text}
    </div>
  );
}

/** Fades and lifts a block in, for lines that should not compete with a headline. */
export function Lift({
  at,
  exit,
  children,
  distance = 24,
  style,
}: {
  readonly at: number;
  readonly exit?: number;
  readonly children: ReactNode;
  readonly distance?: number;
  readonly style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [at, at + 14], [0, 1], {
    ...CLAMP,
    easing: outExpo,
  });
  const gone =
    exit === undefined
      ? 0
      : interpolate(frame, [exit, exit + 8], [0, 1], {
          ...CLAMP,
          easing: inQuint,
        });
  return (
    <div
      style={{
        opacity: t * (1 - gone),
        translate: `0px ${(1 - t) * distance - gone * distance}px`,
        filter: `blur(${(1 - t) * 6}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
