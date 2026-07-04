import { useId } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { cn } from '@/lib/cn';

interface GlowCircleProps {
  size: number;
  color: string;
  opacity?: number;
  className?: string;
}

/**
 * Decorative radial glow — RN stand-in for the desktop cards' corner blobs
 * (`radial-gradient(circle,rgba(212,197,163,.16),transparent 70%)`; typical
 * usage: size 180–220, color '#d4c5a3', opacity .16–.2).
 */
export function GlowCircle({
  size,
  color,
  opacity = 0.25,
  className,
}: GlowCircleProps) {
  const id = `zp-glow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <View className={cn('absolute', className)} pointerEvents="none">
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id}>
            <Stop offset="0" stopColor={color} stopOpacity={opacity} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
