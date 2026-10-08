import { cn } from '@/lib/cn';
import { Icon } from '@/components/ui/Icon';
import { tokens } from '@zapengine/design-tokens/tokens';
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Coins,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react-native';
import { memo } from 'react';
import { Text, View } from 'react-native';

import type { TranslationKey } from '@/i18n/translations';
import {
  hasUsableAttribution,
  type RangeAttributionSummary,
} from '@/integration/rangeAttribution';
import { formatSignedUsd } from '@/lib/format';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

interface HomeAttributionBreakdownProps {
  summary: RangeAttributionSummary | null;
}

const ICON_SIZE = 12;

function BreakdownRow({
  Icon,
  label,
  valueUsd,
}: {
  Icon: LucideIcon;
  label: string;
  valueUsd: number;
}) {
  const amount = formatSignedUsd(valueUsd, 0);

  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${amount}`}
      className="flex-row items-center gap-2"
    >
      <Icon
        size={ICON_SIZE}
        strokeWidth={2}
        color={tokens.mode.night['ink-3']}
      />
      <Text
        numberOfLines={1}
        className="font-mono-medium flex-1 text-label text-ink-2"
      >
        {label}
      </Text>
      <Text
        className={cn(
          'font-mono text-data',
          valueUsd < 0 ? 'text-down' : 'text-up',
        )}
      >
        {amount}
      </Text>
    </View>
  );
}

/**
 * Where the headline change came from. Hidden rather than guessed at when too
 * few of the range's days can be explained.
 */
export const HomeAttributionBreakdown = memo(function HomeAttributionBreakdown({
  summary,
}: HomeAttributionBreakdownProps) {
  const { t } = useContentLanguage();
  if (!summary || !hasUsableAttribution(summary)) return null;

  const gains = formatSignedUsd(summary.gainsUsd, 0);
  const losses = formatSignedUsd(summary.lossesUsd, 0);
  const rows: { key: TranslationKey; Icon: LucideIcon; valueUsd: number }[] = [
    {
      key: 'home.attribution.price',
      Icon: TrendingUp,
      valueUsd: summary.marketUsd,
    },
    {
      key: 'home.attribution.protocol',
      Icon: Coins,
      valueUsd: summary.protocolUsd,
    },
    {
      key: 'home.attribution.flows',
      Icon: ArrowLeftRight,
      // Unexplained days are a flow as far as the reader is concerned: they are
      // the part the app cannot claim the user earned.
      valueUsd: summary.flowUsd + summary.otherUsd,
    },
  ];

  return (
    <View className="mt-3 gap-1.5">
      <View className="flex-row items-center gap-3">
        <View
          accessible
          accessibilityLabel={`${gains} ${t('home.attribution.gains')}`}
          className="flex-row items-center gap-1"
        >
          <Icon icon={ArrowUpRight} size="xs" tone="up" />
          <Text className="font-mono text-data text-up">{gains}</Text>
          <Text className="font-mono-medium text-label text-ink-2">
            {t('home.attribution.gains')}
          </Text>
        </View>
        <View
          accessible
          accessibilityLabel={`${losses} ${t('home.attribution.losses')}`}
          className="flex-row items-center gap-1"
        >
          <Icon icon={ArrowDownRight} size="xs" tone="down" />
          <Text className="font-mono text-data text-down">{losses}</Text>
          <Text className="font-mono-medium text-label text-ink-2">
            {t('home.attribution.losses')}
          </Text>
        </View>
      </View>

      {rows.map(({ key, Icon, valueUsd }) => (
        <BreakdownRow
          key={key}
          Icon={Icon}
          label={t(key)}
          valueUsd={valueUsd}
        />
      ))}

      <Text className="font-mono-medium text-label leading-[13px] text-ink-3">
        {t('home.attribution.basis')}
      </Text>
    </View>
  );
});
