import { Children, type ReactElement, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { cn } from '@/lib/cn';
const tones = {
  neutral: 'border-line bg-surface-elevated',
  accent: 'border-accent-line bg-accent-soft',
  danger: 'border-danger-line bg-danger-soft',
  warning: 'border-warning-line bg-warning-soft',
  success: 'border-success-line bg-success-soft',
} as const;
export function Badge({
  children,
  tone = 'neutral',
  className,
  style,
}: {
  children: ReactNode;
  tone?: keyof typeof tones;
  className?: string;
  style?: StyleProp<ViewStyle>;
}): ReactElement {
  return (
    <View
      className={cn(
        'flex-row items-center gap-1.5 self-start rounded-pill border px-2.5 py-1',
        tones[tone],
        className,
      )}
      style={style}
    >
      {Children.map(children, (child) =>
        typeof child === 'string' || typeof child === 'number' ? (
          <Text
            variant="overline"
            tone={tone === 'neutral' ? 'secondary' : tone}
          >
            {child}
          </Text>
        ) : (
          child
        ),
      )}
    </View>
  );
}
