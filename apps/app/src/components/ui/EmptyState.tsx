import type { ReactElement } from 'react';
import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { Button } from './Button';
interface EmptyStateProps {
  icon: LucideIcon;
  tone?: 'default' | 'danger';
  title: string;
  body: string;
  action?: { label: string; onPress: () => void; accessibilityLabel: string };
}
export function EmptyState({
  icon,
  tone = 'default',
  title,
  body,
  action,
}: EmptyStateProps): ReactElement {
  return (
    <View className="items-center px-4 py-6">
      <View
        className={
          tone === 'danger'
            ? 'h-hit w-hit items-center justify-center rounded-pill border border-danger-line bg-danger-soft'
            : 'h-hit w-hit items-center justify-center rounded-pill border border-accent-line bg-accent-subtle'
        }
      >
        <Icon icon={icon} tone={tone === 'danger' ? 'danger' : 'accent'} />
      </View>
      <Text variant="subheading" className="mt-3 text-center">
        {title}
      </Text>
      <Text
        variant="body-sm"
        tone="secondary"
        className="mt-1 max-w-measure text-center"
      >
        {body}
      </Text>
      {action ? (
        <Button
          className="mt-3"
          variant="tonal"
          accessibilityLabel={action.accessibilityLabel}
          onPress={action.onPress}
        >
          {action.label}
        </Button>
      ) : null}
    </View>
  );
}
