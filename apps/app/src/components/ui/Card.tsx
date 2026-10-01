import type { ReactNode, ReactElement } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { PressableSurface } from './PressableSurface';
import { cn } from '@/lib/cn';
const variants = {
  surface: 'border border-line bg-surface',
  elevated: 'border border-line-hi bg-surface-elevated',
  outline: 'border border-line bg-transparent',
  accent: 'border border-accent-line bg-accent-soft',
} as const;
const paddings = { none: '', sm: 'p-3', md: 'p-5', lg: 'p-6' } as const;
const radii = { card: 'rounded-card', sheet: 'rounded-sheet' } as const;
interface CardProps {
  children: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  variant?: keyof typeof variants;
  padding?: keyof typeof paddings;
  radius?: keyof typeof radii;
  onPress?: () => void;
  accessibilityLabel?: string;
}
export function Card({
  children,
  className,
  style,
  variant = 'surface',
  padding = 'none',
  radius = 'card',
  onPress,
  accessibilityLabel,
}: CardProps): ReactElement {
  const classes = cn(
    'relative overflow-hidden',
    variants[variant],
    paddings[padding],
    radii[radius],
    className,
  );
  return (
    <PressableSurface
      className={classes}
      style={style}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </PressableSurface>
  );
}
