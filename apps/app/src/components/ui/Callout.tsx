import type { ReactElement, ReactNode } from 'react';
import { CircleCheck, Info, TriangleAlert } from 'lucide-react-native';
import { View } from 'react-native';
import { Text } from './Text';
import { Icon } from './Icon';
import { Button } from './Button';
import { Rail } from './Rail';
import { palette } from '@/lib/palette';
import { cn } from '@/lib/cn';
const tones = {
  neutral: 'border-rule bg-sheet',
  caution: 'border-dashed border-rule-2 bg-sheet',
  alert: 'border-alert bg-alert-wash',
  done: 'border-rule bg-sheet',
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
    tone === 'done'
      ? CircleCheck
      : tone === 'alert' || tone === 'caution'
        ? TriangleAlert
        : Info;
  const textTone =
    tone === 'alert' ? 'alert' : tone === 'caution' ? 'secondary' : 'default';
  return (
    <View
      {...(tone === 'alert' || tone === 'caution'
        ? { accessibilityRole: 'alert' as const }
        : {})}
      className={cn('rounded-panel border p-4', tones[tone], className)}
    >
      {tone === 'caution' ? (
        <Rail status="planned" color={palette['rule-2']} />
      ) : null}
      <View className="flex-row items-start gap-3">
        <Icon icon={icon} tone={textTone} />
        <View className="min-w-0 flex-1">
          {title ? (
            <Text variant="heading" tone={textTone}>
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
