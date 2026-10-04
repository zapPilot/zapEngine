import type { FC } from 'react';
import { useCurrentFrame } from 'remotion';

import { enter, rise } from '../../../primitives/motion';
import { jaFont } from '../fonts';
import { FIGURES } from '../story';
import { theme } from '../theme';
import { Icon } from './icons';

/** Frames between layers as the stack builds up. */
const STEP = 9;

/**
 * Everything KOKODE installs, built from the hardware up; the chat screen the
 * team uses lights up last.
 */
export const StackReveal: FC<{
  readonly from: number;
  readonly highlightFrom: number;
}> = ({ from, highlightFrom }) => {
  const frame = useCurrentFrame();
  const { layers } = FIGURES.turnkey;
  const glow = rise(frame, highlightFrom, 14);
  return (
    <div
      style={{
        width: 820,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        fontFamily: jaFont,
        fontSize: 28,
      }}
    >
      {layers.map((layer, index) => {
        const top = index === 0;
        const last = index === layers.length - 1;
        const lit = top ? glow : 0;
        return (
          <div
            key={layer.title}
            style={{
              display: 'grid',
              gridTemplateColumns: '230px 1fr auto',
              alignItems: 'center',
              gap: 24,
              minHeight: 104,
              padding: '0 32px',
              borderRadius: 24,
              border: '1px solid rgba(0, 0, 0, 0.06)',
              background: lit > 0.5 ? theme.blue : theme.surface,
              color: lit > 0.5 ? theme.surface : theme.ink,
              boxShadow: `0 ${12 + lit * 18}px ${36 + lit * 30}px rgba(0, 113, 227, ${0.06 + lit * 0.2})`,
              ...enter(frame, from + (layers.length - 1 - index) * STEP, {
                distance: 46,
              }),
            }}
          >
            <strong>{layer.title}</strong>
            <span
              style={{
                fontSize: 24,
                color: lit > 0.5 ? 'rgba(255, 255, 255, 0.82)' : theme.muted,
              }}
            >
              {layer.text}
            </span>
            {last ? <Icon name="server" size={44} color={theme.muted} /> : null}
          </div>
        );
      })}
    </div>
  );
};
