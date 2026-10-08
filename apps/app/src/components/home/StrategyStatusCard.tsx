import { tokens } from '@zapengine/design-tokens/tokens';
import { Icon } from '@/components/ui/Icon';
import { ArrowRight, Check, TriangleAlert, Zap } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { Tap } from '@/components/ui/Tap';
import type { HomeStrategyStatusView } from '@/integration/useHomeData';
import { formatUsd } from '@/lib/format';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

export function StrategyStatusCard({
  status,
  loading,
  onPress,
}: {
  status: HomeStrategyStatusView | null;
  loading: boolean;
  onPress?: (() => void) | undefined;
}) {
  const { t } = useContentLanguage();

  if (loading && !status) {
    return (
      <View>
        <SectionHeader title={t('home.strategyStatusTitle')} />
        <Card className="mt-3 p-4">
          <SkeletonBlock className="h-5 w-48" />
          <SkeletonBlock className="mt-3 h-4 w-64" />
          <SkeletonBlock className="mt-2 h-4 w-40" />
        </Card>
      </View>
    );
  }

  if (!status) return null;

  const isActionRequired = status.status === 'action_required';
  const isBlocked = status.status === 'blocked';
  const title = isActionRequired
    ? t('home.rebalanceRecommended')
    : isBlocked
      ? t('home.strategyBlocked')
      : t('home.portfolioOnTarget');
  const icon = isActionRequired ? (
    <Icon icon={Zap} size="sm" tone="default" />
  ) : isBlocked ? (
    <Icon icon={TriangleAlert} size="sm" tone="alert" />
  ) : (
    <Icon icon={Check} size="sm" tone="default" />
  );

  return (
    <View>
      <SectionHeader title={t('home.strategyStatusTitle')} />
      <Tap
        accessibilityRole={onPress ? 'button' : undefined}
        onPress={onPress}
        className="mt-3"
      >
        <Card
          className="p-4"
          style={{
            borderColor: isActionRequired
              ? tokens.mode.night['sign-ink']
              : tokens.mode.night.rule,
          }}
        >
          <View className="flex-row items-center gap-2">
            {icon}
            <Text className="flex-1 font-text-semibold text-body text-ink">
              {title}
            </Text>
            {onPress ? <Icon icon={ArrowRight} size="sm" tone="muted" /> : null}
          </View>

          <View className="mt-3 flex-row items-center gap-2">
            <Text className="font-mono text-data uppercase tracking-[0.7px] text-ink-3">
              {status.regimeLabel}
            </Text>
            {typeof status.fearGreed === 'number' ? (
              <>
                <Text className="font-mono-medium text-label text-ink-3">
                  ·
                </Text>
                <Text className="font-mono text-data text-ink-2">
                  FGI {Math.round(status.fearGreed)}
                </Text>
              </>
            ) : null}
          </View>

          {status.primaryAction ? (
            <View className="mt-2.5">
              <Text className="font-text text-caption leading-[18px] text-ink-2">
                {status.primaryAction.description}
                {' · '}
                <Text className="font-mono-semibold text-ink">
                  {formatUsd(status.primaryAction.amountUsd)}
                </Text>
              </Text>
              {status.additionalActionCount > 0 ? (
                <Text className="font-mono-medium mt-1 text-label text-ink-3">
                  {t('home.moreStrategyActions', {
                    count: status.additionalActionCount,
                  })}
                </Text>
              ) : null}
            </View>
          ) : status.reason ? (
            <Text className="font-text mt-2.5 text-caption leading-[18px] text-ink-2">
              {status.reason}
            </Text>
          ) : null}

          {onPress ? (
            <Text className="mt-3 font-text-semibold text-label text-sign-ink">
              {isActionRequired
                ? t('home.viewRecommendation')
                : t('home.viewStrategy')}
            </Text>
          ) : null}
        </Card>
      </Tap>
    </View>
  );
}
