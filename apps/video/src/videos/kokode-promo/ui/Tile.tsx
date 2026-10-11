import type { CSSProperties, FC } from 'react';

import { Icon, type IconName } from '../../kokode-clinic/primitives/icons';
import { theme } from '../../kokode-clinic/theme';
import type { InterestId } from '../story';

interface TileLook {
  readonly fill: string;
  readonly ink: string;
  readonly icon: IconName;
  readonly edge?: string;
}

// Only the site's palette: blue and near-black carry the two demo chapters,
// soft blue and white the other two workflows.
const LOOKS: Partial<Record<InterestId, TileLook>> = {
  referral: { fill: theme.blue, ink: theme.surface, icon: 'doc' },
  search: { fill: theme.blueSoft, ink: theme.blue, icon: 'book' },
  materials: { fill: theme.dark, ink: theme.surface, icon: 'pen' },
  voice: {
    fill: theme.surface,
    ink: theme.ink,
    icon: 'mic',
    edge: `inset 0 0 0 2px ${theme.line}`,
  },
};

/** How a workflow's tile is painted. */
export function tileLook(id: InterestId): TileLook {
  return LOOKS[id] ?? { fill: theme.surface, ink: theme.ink, icon: 'doc' };
}

/**
 * A workflow tile: the promo's chapter system. `locked` (0–1) greys it out and
 * stamps a lock, the way cloud AI treats patient work.
 */
export const Tile: FC<{
  readonly id: InterestId;
  readonly size: number;
  readonly locked?: number;
  readonly style?: CSSProperties;
}> = ({ id, size, locked = 0, style }) => {
  const look = tileLook(id);
  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: size * 0.24,
        background: look.fill,
        display: 'grid',
        placeItems: 'center',
        boxShadow: `0 ${size * 0.12}px ${size * 0.3}px rgba(0, 0, 0, 0.14)${look.edge ? `, ${look.edge}` : ''}`,
        filter:
          locked > 0
            ? `grayscale(${locked}) brightness(${1 - locked * 0.08})`
            : undefined,
        ...style,
      }}
    >
      <span style={{ display: 'flex', opacity: 1 - locked }}>
        <Icon
          name={look.icon}
          size={size * 0.52}
          color={look.ink}
          strokeWidth={1.7}
        />
      </span>
      {locked > 0 ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            borderRadius: size * 0.24,
            background: `rgba(110, 110, 115, ${0.55 * locked})`,
            opacity: locked,
            scale: 0.8 + locked * 0.2,
          }}
        >
          <Icon
            name="lock"
            size={size * 0.46}
            color={theme.surface}
            strokeWidth={2}
          />
        </div>
      ) : null}
    </div>
  );
};
