import type { FC } from 'react';
import { AbsoluteFill } from 'remotion';

import { useDrift } from '../../../primitives/Backdrop';
import { theme } from '../theme';

// The site's hero light: a soft blue glow on the page grey, drifting a few
// percent over the film so held frames never look frozen.
export const KokodeBackdrop: FC = () => {
  const drift = useDrift();
  return (
    <AbsoluteFill
      style={{
        background: [
          `radial-gradient(ellipse 60% 48% at ${72 - drift * 14}% ${30 + drift * 10}%, rgba(0, 113, 227, 0.09), transparent 70%)`,
          `radial-gradient(ellipse 40% 36% at ${16 + drift * 8}% 82%, rgba(0, 113, 227, 0.05), transparent 70%)`,
          theme.bg,
        ].join(', '),
      }}
    />
  );
};
