import { tokens } from '@zapengine/design-tokens/tokens';
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Coins,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react-native';
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
        color={tokens.color['ink-faint']}
      />
      <Text numberOfLines={1} className="flex-1 text-[11px] text-ink-dim">
        {label}
      </Text>
      <Text
        className={`font-mono text-[11px] ${
          valueUsd < 0 ? 'text-error' : 'text-ink'
        }`}
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
export function HomeAttributionBreakdown({
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
          <ArrowUpRight
            size={ICON_SIZE}
            strokeWidth={2}
            color={tokens.color.success}
          />
          <Text className="font-mono text-[11px] text-success">{gains}</Text>
          <Text className="text-[11px] text-ink-dim">
            {t('home.attribution.gains')}
          </Text>
        </View>
        <View
          accessible
          accessibilityLabel={`${losses} ${t('home.attribution.losses')}`}
          className="flex-row items-center gap-1"
        >
          <ArrowDownRight
            size={ICON_SIZE}
            strokeWidth={2}
            color={tokens.color.error}
          />
          <Text className="font-mono text-[11px] text-error">{losses}</Text>
          <Text className="text-[11px] text-ink-dim">
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

      <Text className="text-[9.5px] leading-[13px] text-ink-faint">
        {t('home.attribution.basis')}
      </Text>
    </View>
  );
}
