import { Text, View } from 'react-native';

import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { cn } from '@/lib/cn';

interface InlineErrorCardProps {
  title?: string;
  body: string;
  /** Optional recovery action rendered as a secondary pill button. */
  action?: { label: string; onPress: () => void };
  className?: string;
}

/** Shared inline error surface — the only place error-tinted chrome is drawn. */
export function InlineErrorCard({
  title = 'Something went wrong',
  body,
  action,
  className,
}: InlineErrorCardProps) {
  return (
    <View
      accessibilityRole="alert"
      className={cn(
        'self-stretch rounded-2xl border border-error/40 bg-error/10 p-4',
        className,
      )}
    >
      <Text className="font-sans-semibold text-[13px] text-error">{title}</Text>
      <Text className="mt-1 font-sans text-[12px] leading-[18px] text-ink-dim">
        {body}
      </Text>
      {action ? (
        <PrimaryButton
          className="mt-4"
          variant="secondary"
          onPress={action.onPress}
        >
          {action.label}
        </PrimaryButton>
      ) : null}
    </View>
  );
}
