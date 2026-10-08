import type { ReactElement } from 'react';
import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { Button } from './Button';
interface EmptyStateProps {
  icon: LucideIcon;
  tone?: 'default' | 'alert';
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
          tone === 'alert'
            ? 'h-hit w-hit items-center justify-center rounded-round border border-alert bg-alert-wash'
            : 'h-hit w-hit items-center justify-center rounded-round border border-rule-2 bg-well'
        }
      >
        <Icon icon={icon} tone={tone === 'alert' ? 'alert' : 'default'} />
      </View>
      <Text variant="heading" className="mt-3 text-center">
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
          variant="secondary"
          accessibilityLabel={action.accessibilityLabel}
          onPress={action.onPress}
        >
          {action.label}
        </Button>
      ) : null}
    </View>
  );
}
