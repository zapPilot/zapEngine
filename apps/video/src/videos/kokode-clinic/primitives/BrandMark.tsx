import type { FC } from 'react';
import { Img, staticFile } from 'remotion';

import { jaFont } from '../fonts';
import { SITE } from '../story';
import { theme } from '../theme';

/** The Kokode mark (a byte copy of the site's favicon) and wordmark. */
export const BrandMark: FC<{ readonly size: number }> = ({ size }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: size * 0.32,
      fontFamily: jaFont,
      fontWeight: 800,
      fontSize: size * 0.78,
      letterSpacing: '-0.04em',
      color: theme.ink,
    }}
  >
    <Img
      src={staticFile('brand/kokode-mark.svg')}
      style={{ width: size, height: size }}
    />
    {SITE.name}
  </span>
);
