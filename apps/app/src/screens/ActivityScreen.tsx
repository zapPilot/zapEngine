import { ALLOCATION_CATEGORIES } from '@zapengine/app-core/lib/domain/allocationCategories';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { ActivityRow } from '@/components/activity/ActivityRow';
import { CategoryFlowCard } from '@/components/activity/CategoryFlowCard';
import { Card } from '@/components/ui/Card';
import { InlineErrorCard } from '@/components/ui/InlineErrorCard';
import { RangeTabs } from '@/components/ui/RangeTabs';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { ACTIVITY_FILTERS, type ActivityFilter, DEMO } from '@/data/demo';
import { filterActivityGroups } from '@/integration/activityEventModel';
import { useAccount } from '@/integration/useAccount';
import { useActivityData } from '@/integration/useActivityData';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

const GROUP_LABEL_KEY = {
  Today: 'activity.group.today',
  'This week': 'activity.group.week',
  Earlier: 'activity.group.earlier',
} as const;

function isKnownGroupLabel(
  label: string,
): label is keyof typeof GROUP_LABEL_KEY {
  return label in GROUP_LABEL_KEY;
}

function ActivitySkeleton() {
  return (
    <>
      <Card className="p-4">
        <SkeletonBlock className="h-3 w-24" />
        <SkeletonBlock className="mt-3 h-[6px] w-full rounded-pill" />
        <SkeletonBlock className="mt-4 h-4 w-full" />
        <SkeletonBlock className="mt-2 h-4 w-2/3" />
      </Card>
      <Card className="mt-5 p-4">
        <SkeletonBlock className="h-3 w-full" />
        <SkeletonBlock className="mt-5 h-10 w-full" />
        <SkeletonBlock className="mt-5 h-3 w-28" />
      </Card>
    </>
  );
}

function activityFilterLabel(filter: ActivityFilter, allLabel: string): string {
  return filter === 'All' ? allLabel : ALLOCATION_CATEGORIES[filter].shortLabel;
}

export function ActivityScreen() {
  const [filter, setFilter] = useState<ActivityFilter>('All');
  const { t } = useContentLanguage();
  const account = useAccount();
  const activity = useActivityData({
    isOwnBundle: account.isOwnBundle,
    viewingUserId: account.viewingUserId,
    ownWalletAddresses: account.walletAddresses,
    ownAddress: account.address,
  });

  const isLive = account.isConnected;
  const groups = isLive ? (activity.data?.groups ?? []) : DEMO.activity;
  const summary = isLive
    ? (activity.data?.summary ?? [])
    : DEMO.activitySummary;
  const isLoading = isLive && activity.isLoading;
  const isError = isLive && !isLoading && activity.isError;
  const filteredGroups = filterActivityGroups(groups, filter);

  return (
    <ScreenScrollView>
      <ScreenHeader title={t('activity.title')} />
      <View className="pl-5 pt-2">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="pr-5"
        >
          <RangeTabs
            options={ACTIVITY_FILTERS}
            value={filter}
            comfortable
            accessibilityLabel={t('activity.categoryFilter')}
            optionLabel={(option) =>
              activityFilterLabel(option, t('activity.all'))
            }
            onChange={setFilter}
          />
        </ScrollView>
      </View>
      <View className="px-5 pt-4">
        {isLoading ? (
          <ActivitySkeleton />
        ) : isError ? (
          <InlineErrorCard
            title={t('activity.error')}
            body={t('activity.errorMessage')}
            action={{
              label: t('activity.retry'),
              onPress: activity.refetch,
            }}
          />
        ) : (
          <>
            <CategoryFlowCard
              className="mb-4"
              flows={summary}
              label={`${t('activity.netFlow')} · ${t('activity.recent')}`}
            />
            {filteredGroups.length > 0 ? (
              filteredGroups.map((group) => (
                <View key={group.label} className="mb-4">
                  <Text className="mb-1.5 font-mono text-[9.5px] uppercase tracking-[0.9px] text-ink-faint">
                    {isKnownGroupLabel(group.label)
                      ? t(GROUP_LABEL_KEY[group.label])
                      : group.label}
                  </Text>
                  {group.events.map((event) => (
                    <ActivityRow
                      key={event.id}
                      event={event}
                      failedLabel={t('activity.failed')}
                    />
                  ))}
                </View>
              ))
            ) : (
              <Card className="p-5">
                <Text className="font-sans-semibold text-[15px] text-ink">
                  {t('activity.noActivity')}
                </Text>
                <Text className="mt-2 text-[12.5px] leading-[19px] text-ink-dim">
                  {groups.length > 0
                    ? t('activity.noCategoryActivity')
                    : t('activity.noActivityMessage')}
                </Text>
              </Card>
            )}
          </>
        )}
      </View>
    </ScreenScrollView>
  );
}
