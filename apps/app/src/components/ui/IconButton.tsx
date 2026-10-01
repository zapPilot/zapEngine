import type { LucideIcon } from 'lucide-react-native';
import type { ReactElement } from 'react';
import { View } from 'react-native';
import { Tap, type TapProps } from './Tap';
import { Icon } from './Icon';
import { cn } from '@/lib/cn';
const sizes = {
  sm: 'h-control-sm w-control-sm',
  md: 'h-hit w-hit',
  lg: 'h-control-lg w-control-lg',
  xl: 'h-16 w-16',
} as const;
interface IconButtonProps extends Omit<
  TapProps,
  'children' | 'accessibilityLabel'
> {
  accessibilityLabel: string;
  icon: LucideIcon;
  size?: keyof typeof sizes;
  tone?: 'default' | 'secondary' | 'muted' | 'accent' | 'danger';
  variant?: 'ghost' | 'secondary' | 'tonal';
}
const variants = {
  ghost: 'bg-transparent',
  secondary: 'border border-line bg-surface',
  tonal: 'border border-accent-line bg-accent-soft',
} as const;
export function IconButton({
  icon,
  size = 'md',
  tone = 'secondary',
  variant = 'secondary',
  className,
  ...props
}: IconButtonProps): ReactElement {
  return (
    <Tap
      {...props}
      accessibilityRole="button"
      className={cn(
        'min-h-hit min-w-hit items-center justify-center',
        props.disabled && 'opacity-45',
        className,
      )}
    >
      <View
        className={cn(
          'items-center justify-center rounded-pill',
          sizes[size],
          variants[variant],
        )}
      >
        <Icon
          icon={icon}
          size={size === 'lg' || size === 'xl' ? 'lg' : 'md'}
          tone={tone}
        />
      </View>
    </Tap>
  );
}
