import { tokens } from '@zapengine/design-tokens/tokens';
import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface ProgressRingProps {
  /** 0-100. Clamped defensively; anything non-finite draws an empty ring. */
  value: number;
  /** Outer diameter in px. */
  size?: number;
  strokeWidth?: number;
  /** Centred inside the ring, usually an icon. */
  children?: ReactNode;
}

// The ring only decorates: whatever hosts it (a button) carries the label and
// the value, so it stays out of the accessibility tree on every platform.
const DECORATIVE = {
  'aria-hidden': true,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;
// Plain props rather than JSX attributes: they are SVG vocabulary, not copy.
const STROKE_ONLY = { fill: 'none' } as const;
const ROUND_CAP = { strokeLinecap: 'round' } as const;

/**
 * Determinate circular progress for web and native. The arc is one dashed
 * circle whose gap is slid by `strokeDashoffset`, turned a quarter back so it
 * starts at twelve o'clock.
 */
export function ProgressRing({
  value,
  size = 44,
  strokeWidth = 2,
  children,
}: ProgressRingProps): ReactElement {
  const percent = Number.isFinite(value)
    ? Math.min(100, Math.max(0, value))
    : 0;
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <View
      {...DECORATIVE}
      className="items-center justify-center"
      style={{ width: size, height: size }}
    >
      <View className="absolute" style={{ transform: [{ rotate: '-90deg' }] }}>
        <Svg width={size} height={size}>
          <Circle
            {...STROKE_ONLY}
            cx={center}
            cy={center}
            r={radius}
            stroke={tokens.color['line-hi']}
            strokeWidth={strokeWidth}
          />
          <Circle
            {...STROKE_ONLY}
            {...ROUND_CAP}
            cx={center}
            cy={center}
            r={radius}
            stroke={tokens.color.accent}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - percent / 100)}
          />
        </Svg>
      </View>
      {children}
    </View>
  );
}
