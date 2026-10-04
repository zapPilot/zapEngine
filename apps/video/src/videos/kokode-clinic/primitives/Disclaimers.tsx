import type { FC } from 'react';
import { useCurrentFrame } from 'remotion';

import { safe } from '../../../primitives/layout';
import { rise } from '../../../primitives/motion';
import { jaFont } from '../fonts';
import { type DisclaimerId, footnote } from '../story';
import { theme } from '../theme';

/**
 * The scene's footnotes from the story, just above the captions band: what is
 * an image, what data is fictional, that AI output is a draft.
 */
export const Disclaimers: FC<{
  readonly notes: readonly DisclaimerId[];
  readonly from?: number;
}> = ({ notes, from = 0 }) => {
  const frame = useCurrentFrame();
  if (notes.length === 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: safe.left,
        right: safe.right,
        top: 868,
        display: 'flex',
        flexWrap: 'wrap',
        columnGap: 32,
        rowGap: 4,
        fontFamily: jaFont,
        fontSize: 20,
        lineHeight: 1.4,
        color: theme.muted,
        opacity: rise(frame, from, 12),
      }}
    >
      {notes.map((note) => (
        <span key={note}>{footnote(note)}</span>
      ))}
    </div>
  );
};
