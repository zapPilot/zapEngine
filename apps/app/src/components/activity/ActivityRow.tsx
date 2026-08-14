import { ALLOCATION_CATEGORIES } from '@zapengine/app-core/lib/domain/allocationCategories';
import { Text, View } from 'react-native';

import { TokenIcon } from '@/components/token/TokenIcon';
import { Pill } from '@/components/ui/Pill';
import type { ActivityEvent, MetricTone } from '@/data/demo';
import { cn } from '@/lib/cn';

/** Outflows render in plain ink: spending is normal for a wealth manager. */
const AMOUNT_TONE_CLASS: Record<MetricTone, string> = {
  positive: 'text-success',
  negative: 'text-ink',
  neutral: 'text-ink-dim',
  accent: 'text-accent',
};

export function ActivityRow({
  event,
  failedLabel,
}: {
  event: ActivityEvent;
  failedLabel: string;
}) {
  const categoryColor = event.category
    ? ALLOCATION_CATEGORIES[event.category].color
    : 'rgba(255,255,255,.16)';
  const categoryLabel = event.category
    ? ALLOCATION_CATEGORIES[event.category].label
    : undefined;
  const accessibilityLabel = [
    event.title,
    categoryLabel,
    event.meta,
    event.amountLabel,
    event.status === 'Failed' ? failedLabel : undefined,
    event.time,
    event.kind.replace('-', ' '),
  ]
    .filter((part): part is string => Boolean(part))
    .join(', ');

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      className="flex-row items-center gap-3 border-b border-line py-3 last:border-b-0"
    >
      <View
        className="h-[18px] w-[2px] shrink-0 rounded-full"
        style={{ backgroundColor: categoryColor }}
      />
      {event.tokenSymbol ? (
        <TokenIcon
          symbol={event.tokenSymbol}
          {...(event.chain ? { chainKey: event.chain } : {})}
          size={34}
        />
      ) : (
        <View className="h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[rgba(255,255,255,.06)]">
          <View
            className="h-[9px] w-[9px] rounded-full"
            style={{ backgroundColor: categoryColor }}
          />
        </View>
      )}
      <View className="flex-1">
        <Text
          className="font-sans-semibold text-[14px] text-ink"
          numberOfLines={1}
        >
          {event.title}
        </Text>
        <Text
          className="mt-[3px] font-mono text-[10.5px] text-ink-faint"
          numberOfLines={1}
        >
          {event.meta}
        </Text>
      </View>
      <View className="shrink-0 items-end pl-1">
        {event.amountLabel ? (
          <Text
            className={cn(
              'font-mono-semibold text-[13px]',
              AMOUNT_TONE_CLASS[event.amountTone ?? 'neutral'],
            )}
          >
            {event.amountLabel}
          </Text>
        ) : null}
        <Text className="mt-1 font-mono text-[10px] text-ink-faint">
          {event.time}
        </Text>
        <View className="mt-1 flex-row items-center gap-2">
          {event.status === 'Failed' ? (
            <Pill className="border border-[rgba(255,111,97,.35)] bg-[rgba(255,111,97,.10)] px-2 py-[2px]">
              <Text className="font-mono text-[9px] uppercase tracking-[0.8px] text-error">
                {failedLabel}
              </Text>
            </Pill>
          ) : null}
          <Text className="font-mono text-[9px] uppercase tracking-[0.8px] text-ink-faint">
            {event.kind.replace('-', ' ')}
          </Text>
        </View>
      </View>
    </View>
  );
}
