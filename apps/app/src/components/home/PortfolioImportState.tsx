import { tokens } from '@zapengine/design-tokens/tokens';
import { RefreshCw } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { Tap } from '@/components/ui/Tap';

export function PortfolioImportState({
  title,
  body,
  retryLabel,
  onRetry,
}: {
  title: string;
  body: string;
  retryLabel?: string | undefined;
  onRetry?: (() => void) | undefined;
}) {
  return (
    <View className="items-center justify-center rounded-2xl border border-line bg-[rgba(255,255,255,.025)] px-5 py-5">
      <Text className="text-center font-sans-semibold text-[14px] text-ink">
        {title}
      </Text>
      <Text className="mt-1.5 max-w-[310px] text-center text-[11.5px] leading-[17px] text-ink-dim">
        {body}
      </Text>
      {retryLabel && onRetry ? (
        <Tap
          accessibilityLabel={retryLabel}
          accessibilityRole="button"
          className="mt-3 flex-row items-center gap-1.5 rounded-full border border-[rgba(212,197,163,.22)] bg-[rgba(212,197,163,.07)] px-3 py-1.5"
          onPress={onRetry}
        >
          <RefreshCw size={12} strokeWidth={2} color={tokens.color.accent} />
          <Text className="font-sans-semibold text-[11px] text-accent">
            {retryLabel}
          </Text>
        </Tap>
      ) : null}
    </View>
  );
}
