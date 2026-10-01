import type { LucideIcon } from 'lucide-react-native';
import { Children, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { Tap, type TapProps } from './Tap';
import { Text } from './Text';
import { Icon } from './Icon';
import { Spinner } from './Spinner';
import { cn } from '@/lib/cn';
const variants = {
  primary: 'bg-accent',
  secondary: 'border border-line-hi bg-surface',
  tonal: 'border border-accent-line bg-accent-soft',
  ghost: 'bg-transparent',
  destructive: 'border border-danger-line bg-danger-soft',
} as const;
const sizes = {
  sm: 'min-h-control-sm py-1.5',
  md: 'min-h-control-md py-3',
  lg: 'min-h-control-lg py-4',
} as const;
interface ButtonProps extends Omit<TapProps, 'children'> {
  children: ReactNode;
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  leadingIcon?: LucideIcon;
  trailingIcon?: LucideIcon;
  loading?: boolean;
  showIndicator?: boolean;
}
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  leadingIcon,
  trailingIcon,
  loading = false,
  showIndicator = false,
  className,
  disabled,
  ...props
}: ButtonProps): ReactElement {
  const tone =
    variant === 'primary'
      ? 'inverse'
      : variant === 'destructive'
        ? 'danger'
        : variant === 'tonal'
          ? 'accent'
          : 'default';
  return (
    <Tap
      {...props}
      accessibilityRole={props.accessibilityRole ?? 'button'}
      accessibilityState={{
        ...props.accessibilityState,
        disabled: Boolean(disabled || loading),
        busy: Boolean(loading || props.accessibilityState?.busy),
      }}
      disabled={disabled || loading}
      className={cn(
        'w-full flex-row items-center justify-center gap-2 rounded-control px-4',
        sizes[size],
        variants[variant],
        disabled && 'opacity-45',
        className,
      )}
    >
      <View
        className={cn(
          'flex-row items-center justify-center gap-2',
          loading && 'opacity-0',
        )}
      >
        {leadingIcon ? <Icon icon={leadingIcon} size="sm" tone={tone} /> : null}
        {Children.map(children, (child) =>
          typeof child === 'string' || typeof child === 'number' ? (
            <Text variant="label" tone={tone} numberOfLines={1}>
              {child}
            </Text>
          ) : (
            child
          ),
        )}
        {trailingIcon ? (
          <Icon icon={trailingIcon} size="sm" tone={tone} />
        ) : null}
      </View>
      {loading ? (
        <View className="absolute">
          <Spinner tone={variant === 'primary' ? 'inverse' : 'accent'} />
        </View>
      ) : null}
      {showIndicator ? (
        <View
          accessible={false}
          className="absolute right-2 h-1.5 w-1.5 rounded-pill bg-accent"
        />
      ) : null}
    </Tap>
  );
}
