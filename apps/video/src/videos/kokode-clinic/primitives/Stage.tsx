import type { FC, ReactNode } from 'react';
import { AbsoluteFill } from 'remotion';

import { safe } from '../../../primitives/layout';

/** Height left for a scene between the top margin and the notes. */
export const STAGE_HEIGHT = 740;

/**
 * Kokode scene layout: words on the left, the screen on the right, footnotes
 * just above the captions band.
 */
export const Stage: FC<{
  readonly copy: ReactNode;
  readonly screen?: ReactNode;
  readonly notes?: ReactNode;
}> = ({ copy, screen, notes }) => (
  <AbsoluteFill
    style={{ padding: `${safe.top}px ${safe.right}px 0 ${safe.left}px` }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 72,
        height: STAGE_HEIGHT,
      }}
    >
      <div style={{ width: screen === undefined ? '100%' : 660, flex: 'none' }}>
        {copy}
      </div>
      {screen === undefined ? null : (
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          {screen}
        </div>
      )}
    </div>
    {notes}
  </AbsoluteFill>
);
