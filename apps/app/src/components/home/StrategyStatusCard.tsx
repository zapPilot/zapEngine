import { tokens } from '@zapengine/design-tokens/tokens';
import { ArrowRight, Check, TriangleAlert, Zap } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { SectionLabel } from '@/components/ui/SectionLabel';
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
  onPress: () => void;
}) {
  const { t } = useContentLanguage();

  if (loading && !status) {
    return (
      <View>
        <SectionLabel>{t('home.strategyStatusTitle')}</SectionLabel>
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
    <Zap size={16} strokeWidth={2} color={tokens.color.accent} />
  ) : isBlocked ? (
    <TriangleAlert size={16} strokeWidth={2} color={tokens.color.error} />
  ) : (
    <Check size={16} strokeWidth={2} color={tokens.color.success} />
  );

  return (
    <View>
      <SectionLabel>{t('home.strategyStatusTitle')}</SectionLabel>
      <Tap accessibilityRole="button" onPress={onPress} className="mt-3">
        <Card className="p-4" style={{ borderColor: 'rgba(212,197,163,.2)' }}>
          <View className="flex-row items-center gap-2">
            {icon}
            <Text className="flex-1 font-sans-semibold text-[15px] text-ink">
              {title}
            </Text>
            <ArrowRight
              size={16}
              strokeWidth={1.8}
              color={tokens.color['ink-faint']}
            />
          </View>

          <View className="mt-3 flex-row items-center gap-2">
            <Text className="font-mono text-[10px] uppercase tracking-[0.7px] text-ink-faint">
              {status.regimeLabel}
            </Text>
            {typeof status.fearGreed === 'number' ? (
              <>
                <Text className="text-[10px] text-ink-faint">·</Text>
                <Text className="font-mono text-[10px] text-ink-dim">
                  FGI {Math.round(status.fearGreed)}
                </Text>
              </>
            ) : null}
          </View>

          {status.primaryAction ? (
            <View className="mt-2.5">
              <Text className="text-[12.5px] leading-[18px] text-ink-dim">
                {status.primaryAction.description}
                {' · '}
                <Text className="font-mono-semibold text-ink">
                  {formatUsd(status.primaryAction.amountUsd)}
                </Text>
              </Text>
              {status.additionalActionCount > 0 ? (
                <Text className="mt-1 text-[10.5px] text-ink-faint">
                  {t('home.moreStrategyActions', {
                    count: status.additionalActionCount,
                  })}
                </Text>
              ) : null}
            </View>
          ) : status.reason ? (
            <Text className="mt-2.5 text-[12px] leading-[18px] text-ink-dim">
              {status.reason}
            </Text>
          ) : null}

          <Text className="mt-3 font-sans-semibold text-[11px] text-accent">
            {isActionRequired
              ? t('home.viewRecommendation')
              : t('home.viewStrategy')}
          </Text>
        </Card>
      </Tap>
    </View>
  );
}
