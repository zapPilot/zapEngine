import type React from 'react';
import type { CSSProperties } from 'react';

import { font } from '../brand/fonts';
import { color } from '../brand/tokens';
import { RevealText } from './RevealText';

/**
 * Serif headline with the site's signature turn: the closing words switch to
 * gold italic.
 */
export const Headline: React.FC<{
  readonly lead: string;
  readonly accent?: string;
  readonly from: number;
  readonly size?: number;
  readonly style?: CSSProperties;
}> = ({ lead, accent, from, size = 76, style }) => {
  const leadWords = lead.split(' ').length;
  return (
    <div
      style={{
        fontFamily: font.display,
        fontSize: size,
        lineHeight: 1.08,
        color: color.ink,
        ...style,
      }}
    >
      <RevealText text={lead} from={from} />
      {accent === undefined ? null : (
        <>
          {' '}
          <RevealText
            text={accent}
            from={from + leadWords * 3 + 4}
            style={{ fontStyle: 'italic', color: color['ink'] }}
          />
        </>
      )}
    </div>
  );
};
