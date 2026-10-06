import type { FC } from 'react';
import { useCurrentFrame } from 'remotion';

import { enter, rise } from '../../../primitives/motion';
import { useKokode } from '../context';
import { theme } from '../theme';
import { Icon } from './icons';

/**
 * A phone outside the building whose line to KOKODE breaks: a "cannot
 * connect" mark only, never an imitation of a browser error page.
 */
export const BoundaryPhone: FC<{ readonly from: number }> = ({ from }) => {
  const { fontFamily, story } = useKokode();
  const frame = useCurrentFrame();
  const cut = rise(frame, from + 14, 12);
  const { outside, blocked } = story.FIGURES.boundary;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 26,
        fontFamily,
        fontSize: 26,
        color: theme.muted,
        ...enter(frame, from, { distance: 20 }),
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
        <Icon name="phone" size={48} color={theme.ink} />
        {outside}
      </span>
      <span
        style={{
          width: 180,
          borderTop: `3px dashed ${cut > 0.5 ? theme.danger : theme.line}`,
        }}
      />
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          color: theme.danger,
          fontWeight: 700,
          opacity: cut,
          transform: `scale(${0.85 + cut * 0.15})`,
        }}
      >
        <Icon name="blocked" size={40} color={theme.danger} strokeWidth={2.2} />
        {blocked}
      </span>
    </div>
  );
};
