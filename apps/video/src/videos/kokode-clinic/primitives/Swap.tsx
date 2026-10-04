import type { FC, ReactNode } from 'react';
import { useCurrentFrame } from 'remotion';

import { rise } from '../../../primitives/motion';

/**
 * Two layers in one place: `before` gives way to `after`, cross-fading over
 * the frames up to `at`.
 */
export const Swap: FC<{
  readonly at: number;
  readonly before: ReactNode;
  readonly after: ReactNode;
  readonly height: number;
}> = ({ at, before, after, height }) => {
  const shown = rise(useCurrentFrame(), at - 12, 14);
  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      {[before, after].map((layer, index) => (
        <div
          // The two layers never reorder.
          key={index === 0 ? 'before' : 'after'}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            opacity: index === 0 ? 1 - shown : shown,
          }}
        >
          {layer}
        </div>
      ))}
    </div>
  );
};
