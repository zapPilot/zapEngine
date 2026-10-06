import type { CSSProperties, FC, ReactNode } from 'react';
import { useCurrentFrame } from 'remotion';

import { enter } from '../../../primitives/motion';
import { theme } from '../theme';

/** The dashed in-house boundary of the site's diagrams, with its label. */
export const Zone: FC<{
  readonly label: string;
  readonly from: number;
  readonly children: ReactNode;
  readonly style?: CSSProperties;
}> = ({ label, from, children, style }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: 'relative',
        padding: '34px 22px 22px',
        border: `3px dashed ${theme.blue}`,
        borderRadius: 28,
        ...enter(frame, from, { distance: 16 }),
        ...style,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: -20,
          left: 26,
          padding: '0 12px',
          background: theme.bg,
          color: theme.blue,
          fontSize: 26,
          fontWeight: 700,
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
};

/** A rounded label: a step of a flow or a device in the network. */
export const Pill: FC<{
  readonly children: ReactNode;
  readonly tone?: 'plain' | 'muted' | 'accent' | 'soft' | 'warn';
  readonly from: number;
}> = ({ children, tone = 'plain', from }) => {
  const frame = useCurrentFrame();
  const tones: Record<string, CSSProperties> = {
    plain: { background: theme.surface, border: `2px solid ${theme.line}` },
    muted: { background: '#ececee', color: theme.muted },
    accent: { background: theme.blue, color: theme.surface },
    soft: { background: theme.blueSoft, color: theme.blue },
    warn: {
      border: '2px dashed rgba(215, 0, 21, 0.45)',
      color: theme.danger,
    },
  };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: '12px 20px',
        borderRadius: 18,
        border: '2px solid transparent',
        fontWeight: 700,
        whiteSpace: 'nowrap',
        ...tones[tone],
        ...enter(frame, from, { duration: 12, distance: 14 }),
      }}
    >
      {children}
    </span>
  );
};
