import type { FC } from 'react';
import { Easing, interpolate, useCurrentFrame } from 'remotion';

import { theme } from '../../kokode-clinic/theme';
import { usePromo } from '../context';
import { BOX } from './KokodeBox';

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Height of each glass plate above the device's top face. */
const STEP = 62;

/**
 * What KOKODE installs, as glass plates that drop onto the device one by one:
 * the story's layers above the hardware, bottom-up. Lives in the box's
 * top-face coordinates (pass it as KokodeBox children).
 */
export const LayerStack: FC<{
  /** Frame each plate lands, bottom (AI models) to top (chat interface). */
  readonly landAt: readonly number[];
}> = ({ landAt }) => {
  const { story, fontFamily, lang } = usePromo();
  const frame = useCurrentFrame();
  // The story lists the layers top-down and ends with the hardware itself.
  const plates = story.FIGURES.turnkey.layers.slice(0, -1).reverse();
  return (
    <>
      {plates.map((layer, index) => {
        const land = landAt[index] ?? Number.POSITIVE_INFINITY;
        const drop = interpolate(frame, [land - 9, land], [1, 0], {
          ...CLAMP,
          easing: Easing.in(Easing.cubic),
        });
        const settle = interpolate(frame, [land, land + 8], [1, 0], CLAMP);
        const z =
          26 + index * STEP + drop * 820 - Math.sin(settle * Math.PI) * 6;
        return (
          <div
            key={layer.title}
            style={{
              position: 'absolute',
              left: 34,
              top: 34,
              width: BOX.width - 68,
              height: BOX.depth - 68,
              boxSizing: 'border-box',
              padding: '0 40px',
              borderRadius: BOX.radius - 20,
              background: 'rgba(255, 255, 255, 0.82)',
              border: `1.5px solid rgba(0, 113, 227, ${0.18 + 0.12 * index})`,
              boxShadow: '0 18px 40px rgba(0, 0, 0, 0.10)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 6,
              fontFamily,
              transform: `translateZ(${z}px)`,
              opacity: frame < land - 9 ? 0 : 1,
            }}
          >
            <strong
              style={{
                fontSize: lang === 'en' ? 40 : 42,
                fontWeight: 800,
                color: index === plates.length - 1 ? theme.blue : theme.ink,
              }}
            >
              {layer.title}
            </strong>
            <span style={{ fontSize: 26, color: theme.muted }}>
              {layer.text}
            </span>
          </div>
        );
      })}
    </>
  );
};
