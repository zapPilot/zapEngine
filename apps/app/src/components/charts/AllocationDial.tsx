import { Platform } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { tokens } from '@zapengine/design-tokens/tokens';
import type { SleeveAllocation } from '@/integration/todayModel';
export function AllocationDial({
  allocation,
  size = tokens.size.control.lg,
}: {
  allocation: SleeveAllocation;
  size?: number;
}) {
  const segments = (['btc', 'eth', 'spy', 'stable', 'alt'] as const).map(
    (id) => ({
      id,
      value: Math.max(0, allocation[id]),
      color: tokens.sleeve.night[id],
    }),
  );
  const noFill = 'none';
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const viewBox = [0, 0, 48, 48].join(' ');
  return (
    <Svg
      width={size}
      height={size}
      viewBox={viewBox}
      {...(Platform.OS === 'web'
        ? { 'aria-hidden': true }
        : { accessible: false })}
    >
      <Circle
        cx={24}
        cy={24}
        r={radius}
        fill={noFill}
        stroke={tokens.mode.night.rule}
        strokeWidth={tokens.line.rail}
      />
      {segments.map((segment) => {
        const start = offset;
        offset += segment.value * circumference;
        return (
          <Circle
            key={segment.id}
            cx={24}
            cy={24}
            r={radius}
            fill={noFill}
            stroke={segment.color}
            strokeWidth={tokens.line.rail}
            strokeDasharray={[
              segment.value * circumference,
              circumference,
            ].join(' ')}
            strokeDashoffset={-start}
            rotation={-90}
            origin={[24, 24].join(',')}
          />
        );
      })}
    </Svg>
  );
}
