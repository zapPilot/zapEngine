import type { FC } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

import { enter, rise } from '../../../primitives/motion';
import { jaFont } from '../fonts';
import { BEATS, type DisclaimerId, FILM_LINK } from '../story';
import { theme } from '../theme';
import { BrandMark } from './BrandMark';
import { Disclaimers } from './Disclaimers';
import { JaHeadline } from './JaHeadline';

/** The address viewers type; the full link with UTM lives in the story. */
const HOST = new URL(FILM_LINK).host;

/**
 * Closing frames: the ask, then the brand line, the address and the
 * film-wide footnote.
 */
export const KokodeEndCard: FC<{
  readonly ask: readonly string[];
  readonly from: number;
  readonly brandFrom: number;
  readonly notes: readonly DisclaimerId[];
}> = ({ ask, from, brandFrom, notes }) => {
  const frame = useCurrentFrame();
  const swap = rise(frame, brandFrom - 8, 14);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          paddingBottom: 140,
          textAlign: 'center',
          opacity: 1 - swap,
          translate: `0px ${(-swap * 40).toFixed(2)}px`,
        }}
      >
        <JaHeadline lines={ask} from={from} size={74} />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          gap: 36,
          paddingBottom: 140,
          fontFamily: jaFont,
          opacity: swap,
        }}
      >
        <span style={enter(frame, brandFrom, { distance: 12 })}>
          <BrandMark size={72} />
        </span>
        <span
          style={{
            fontSize: 112,
            fontWeight: 800,
            letterSpacing: '-0.03em',
            color: theme.blue,
            ...enter(frame, brandFrom + 6, { distance: 24, blur: 6 }),
          }}
        >
          {BEATS.hero.eyebrow}
        </span>
        <span
          style={{
            fontSize: 40,
            fontWeight: 600,
            color: theme.ink,
            ...enter(frame, brandFrom + 16, { distance: 14 }),
          }}
        >
          {HOST}
        </span>
      </AbsoluteFill>
      <Disclaimers notes={notes} from={brandFrom + 20} />
    </AbsoluteFill>
  );
};
