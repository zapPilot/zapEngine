import type { ReactNode, ReactElement } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { PressableSurface } from './PressableSurface';
import { cn } from '@/lib/cn';
const variants = {
  surface: 'border border-rule bg-sheet',
  outline: 'border border-rule bg-transparent',
  sign: 'border border-sign-ink bg-sign-wash',
  pending: 'border border-dashed border-rule-2 bg-transparent',
} as const;
const paddings = { none: '', sm: 'p-3', md: 'p-5', lg: 'p-6' } as const;
const radii = { panel: 'rounded-panel', sheet: 'rounded-sheet' } as const;
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
  radius = 'panel',
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
