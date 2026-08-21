import { tokens } from '@zapengine/design-tokens/tokens';
import { RefreshCw } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Tap } from '@/components/ui/Tap';

interface EmptyStateProps {
  icon: ReactNode;
  tone?: 'default' | 'error';
  title: string;
  body: string;
  action?: {
    label: string;
    onPress: () => void;
    accessibilityLabel: string;
  };
}

export function EmptyState({
  icon,
  tone = 'default',
  title,
  body,
  action,
}: EmptyStateProps) {
  const isError = tone === 'error';

  return (
    <View className="items-center px-4 py-6">
      <View
        className="h-10 w-10 items-center justify-center rounded-full border"
        style={{
          borderColor: isError
            ? 'rgba(239,116,116,.24)'
            : 'rgba(212,197,163,.2)',
          backgroundColor: isError
            ? 'rgba(239,116,116,.08)'
            : 'rgba(212,197,163,.07)',
        }}
      >
        {icon}
      </View>
      <Text className="mt-3 font-sans-semibold text-[13.5px] text-ink">
        {title}
      </Text>
      <Text className="mt-1 max-w-[270px] text-center text-[11.5px] leading-[17px] text-ink-dim">
        {body}
      </Text>
      {action ? (
        <Tap
          accessibilityLabel={action.accessibilityLabel}
          accessibilityRole="button"
          className="mt-3 flex-row items-center gap-1.5 rounded-full border px-3 py-1.5"
          style={{
            borderColor: 'rgba(212,197,163,.22)',
            backgroundColor: 'rgba(212,197,163,.07)',
          }}
          onPress={action.onPress}
        >
          <RefreshCw size={12} strokeWidth={2} color={tokens.color.accent} />
          <Text className="font-sans-semibold text-[11px] text-accent">
            {action.label}
          </Text>
        </Tap>
      ) : null}
    </View>
  );
}
