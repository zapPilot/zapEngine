import type { ReactNode, ReactElement } from 'react';
import { ChevronRight } from 'lucide-react-native';
import { View } from 'react-native';
import { Text } from './Text';
import { PressableSurface } from './PressableSurface';
import { Icon } from './Icon';
import { Divider } from './Divider';
import { cn } from '@/lib/cn';
interface ListRowProps {
  title: ReactNode;
  leading?: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  detail?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  destructive?: boolean;
  divider?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  className?: string;
}
export function ListRow({
  title,
  leading,
  subtitle,
  value,
  detail,
  trailing,
  chevron = false,
  destructive = false,
  divider = false,
  onPress,
  accessibilityLabel,
  className,
}: ListRowProps): ReactElement {
  const content = (
    <>
      <View className="min-h-12 flex-row items-center gap-3 py-3">
        {leading}
        <View className="min-w-0 flex-1">
          <Text variant="body-sm" tone={destructive ? 'danger' : 'secondary'}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" tone="muted" className="mt-1">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {value != null || detail ? (
          <View className="max-w-reading items-end">
            <Text variant="numeric-sm" numeric>
              {value}
            </Text>
            {detail ? (
              <Text variant="caption" tone="muted">
                {detail}
              </Text>
            ) : null}
          </View>
        ) : null}
        {trailing}
        {chevron ? <Icon icon={ChevronRight} size="sm" tone="muted" /> : null}
      </View>
      {divider ? <Divider /> : null}
    </>
  );
  return (
    <PressableSurface
      className={cn(className)}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
    >
      {content}
    </PressableSurface>
  );
}
