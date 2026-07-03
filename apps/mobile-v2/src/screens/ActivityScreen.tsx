import { useState } from 'react';
import { Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { RangeTabs } from '@/components/ui/RangeTabs';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import {
  ACTIVITY_FILTERS,
  type ActivityEvent,
  type ActivityFilter,
  DEMO,
} from '@/data/demo';
import { useAccount } from '@/integration/useAccount';
import { useActivityData } from '@/integration/useActivityData';

function ActivityRow({ event }: { event: ActivityEvent }) {
  return (
    <View className="border-b border-line py-3 last:border-b-0">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="font-sans-semibold text-[14px] text-ink">
            {event.title}
          </Text>
          <Text className="mt-1 text-[12px] text-ink-dim">{event.meta}</Text>
        </View>
        <View className="items-end">
          {event.amountLabel ? (
            <Text className="font-mono-semibold text-[13px] text-accent">
              {event.amountLabel}
            </Text>
          ) : null}
          <Text className="mt-1 font-mono text-[10px] text-ink-faint">
            {event.time}
          </Text>
        </View>
      </View>
      <View className="mt-2 flex-row items-center justify-between">
        <Pill className="border border-line bg-[rgba(255,255,255,.04)]">
          {event.status}
        </Pill>
        <Text className="font-mono text-[10px] uppercase tracking-[0.8px] text-ink-faint">
          {event.kind}
        </Text>
      </View>
    </View>
  );
}

export function ActivityScreen() {
  const [filter, setFilter] = useState<ActivityFilter>('All');
  const account = useAccount();
  const activity = useActivityData(
    account.walletAddresses[0] ?? account.address,
  );
  const groups = account.isConnected
    ? (activity.data?.groups ?? [])
    : DEMO.activity;

  return (
    <ScreenScrollView>
      <ScreenHeader title="Activity" />
      <View className="px-5 pt-4">
        <RangeTabs
          options={ACTIVITY_FILTERS}
          value={filter}
          onChange={(value) => setFilter(value as ActivityFilter)}
        />
      </View>
      <View className="px-5 pt-5">
        {activity.isLoading && account.isConnected ? (
          <Card className="p-4">
            <SkeletonBlock className="h-5 w-40" />
            <SkeletonBlock className="mt-3 h-4 w-full" />
            <SkeletonBlock className="mt-2 h-4 w-3/4" />
          </Card>
        ) : groups.length > 0 ? (
          groups.map((group) => (
            <View key={group.label} className="mb-5">
              <Text className="mb-2 font-mono text-[10px] uppercase tracking-[1px] text-ink-faint">
                {group.label}
              </Text>
              <Card className="px-4">
                {group.events.map((event) => (
                  <ActivityRow key={event.id} event={event} />
                ))}
              </Card>
            </View>
          ))
        ) : (
          <Card className="p-5">
            <Text className="font-sans-semibold text-[15px] text-ink">
              No activity yet
            </Text>
            <Text className="mt-2 text-[12.5px] leading-[19px] text-ink-dim">
              Deposits, sends, and strategy changes will appear here.
            </Text>
          </Card>
        )}
      </View>
    </ScreenScrollView>
  );
}
