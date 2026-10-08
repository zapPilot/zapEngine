import { Children, type ReactElement, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { tokens } from '@zapengine/design-tokens/tokens';
import { Text } from './Text';
import { StatusGlyph } from './StatusGlyph';
import { cn } from '@/lib/cn';
import { palette } from '@/lib/palette';
const colors = {
  default: palette.ink,
  secondary: palette['ink-2'],
  alert: palette.alert,
};
export function Badge({
  children,
  tone = 'default',
  status = 'live',
  className,
  style,
}: {
  children: ReactNode;
  tone?: keyof typeof colors;
  status?: keyof typeof tokens.status;
  className?: string;
  style?: StyleProp<ViewStyle>;
}): ReactElement {
  return (
    <View
      className={cn('flex-row items-center gap-1.5 self-start', className)}
      style={style}
    >
      <StatusGlyph status={status} color={colors[tone]} />
      {Children.map(children, (child) =>
        typeof child === 'string' || typeof child === 'number' ? (
          <Text variant="label" tone={tone}>
            {child}
          </Text>
        ) : (
          child
        ),
      )}
    </View>
  );
}
