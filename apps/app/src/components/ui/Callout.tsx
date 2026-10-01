import type { ReactElement, ReactNode } from 'react';
import {
  CircleCheck,
  Info,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react-native';
import { View } from 'react-native';
import { Text } from './Text';
import { Icon } from './Icon';
import { Button } from './Button';
import { cn } from '@/lib/cn';
const tones = {
  neutral: 'border-line bg-surface',
  info: 'border-accent-line bg-accent-subtle',
  success: 'border-success-line bg-success-soft',
  warning: 'border-warning-line bg-warning-soft',
  danger: 'border-danger-line bg-danger-soft',
} as const;
interface CalloutAction {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
}
interface CalloutProps {
  tone?: keyof typeof tones;
  title?: ReactNode;
  body?: ReactNode;
  children?: ReactNode;
  action?: CalloutAction;
  secondaryAction?: CalloutAction;
  className?: string;
}
export function Callout({
  tone = 'neutral',
  title,
  body,
  children,
  action,
  secondaryAction,
  className,
}: CalloutProps): ReactElement {
  const icon =
    tone === 'info'
      ? ShieldCheck
      : tone === 'success'
        ? CircleCheck
        : tone === 'danger' || tone === 'warning'
          ? TriangleAlert
          : Info;
  const textTone =
    tone === 'info' ? 'accent' : tone === 'neutral' ? 'default' : tone;
  return (
    <View
      {...(tone === 'danger' || tone === 'warning'
        ? { accessibilityRole: 'alert' as const }
        : {})}
      className={cn('rounded-card border p-4', tones[tone], className)}
    >
      <View className="flex-row items-start gap-3">
        <Icon icon={icon} tone={textTone} />
        <View className="min-w-0 flex-1">
          {title ? (
            <Text variant="subheading" tone={textTone}>
              {title}
            </Text>
          ) : null}
          {body ? (
            <Text
              variant="body-sm"
              tone="secondary"
              className={title ? 'mt-1' : ''}
            >
              {body}
            </Text>
          ) : null}
          {children}
        </View>
      </View>
      {[action, secondaryAction].map((item, index) =>
        item ? (
          <Button
            key={index}
            className={index === 0 ? 'mt-4' : 'mt-2'}
            variant={item.variant ?? 'secondary'}
            onPress={item.onPress}
            loading={item.loading ?? false}
            {...(item.accessibilityLabel
              ? { accessibilityLabel: item.accessibilityLabel }
              : {})}
          >
            {item.label}
          </Button>
        ) : null,
      )}
    </View>
  );
}
