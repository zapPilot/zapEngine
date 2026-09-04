import { ArrowDownRight, ArrowUpRight } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { ProtocolIcon } from '@/components/token/ProtocolIcon';
import { TokenIcon } from '@/components/token/TokenIcon';
import { Card } from '@/components/ui/Card';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import type {
  HomeIncomeView,
  HomeProtocolIncomeRow,
} from '@/integration/homeIncomeModel';
import { formatSignedUsd, formatUsd } from '@/lib/format';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

interface HomeIncomeCardProps {
  income: HomeIncomeView;
  isLoading: boolean;
  isError: boolean;
}

function PositionIcon({ row }: { row: HomeProtocolIncomeRow }) {
  const visibleTokens = row.tokenSymbols.slice(0, 3);

  return (
    <View className="relative h-11 w-12 shrink-0">
      <View className="absolute left-0 top-0">
        <ProtocolIcon protocol={row.protocol} size={36} />
      </View>
      {visibleTokens.map((symbol, index) => (
        <View
          key={symbol}
          className="absolute rounded-full border border-[#0a0a0a] bg-[#0a0a0a]"
          style={{
            left: 25 + index * 11,
            top: 25,
            zIndex: visibleTokens.length - index,
          }}
        >
          <TokenIcon symbol={symbol} size={17} alt={symbol} />
        </View>
      ))}
    </View>
  );
}

function IncomeRow({ row }: { row: HomeProtocolIncomeRow }) {
  const metadata = [row.chain, row.positionTypes[0]].filter(Boolean).join(' · ');
  const tokenLabel = row.tokenSymbols.join(' / ');
  const isCost = row.monthlyNetUsd < 0;

  return (
    <View
      accessible
      accessibilityLabel={`${row.protocol}, ${metadata}, ${tokenLabel}, ${formatSignedUsd(row.monthlyNetUsd)}`}
      className="flex-row items-center gap-3 py-2"
    >
      <PositionIcon row={row} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-[13px] text-ink">
          {row.protocol}
        </Text>
        {metadata ? (
          <Text
            numberOfLines={1}
            className="mt-0.5 font-mono text-[9.5px] text-ink-faint"
          >
            {metadata}
          </Text>
        ) : null}
        {tokenLabel ? (
          <Text numberOfLines={1} className="mt-0.5 text-[10.5px] text-ink-dim">
            {tokenLabel}
          </Text>
        ) : null}
      </View>
      <Text
        className={`font-mono-semibold text-[12px] ${
          isCost ? 'text-[#ef9292]' : 'text-accent'
        }`}
      >
        {formatSignedUsd(row.monthlyNetUsd)}
      </Text>
    </View>
  );
}

export function HomeIncomeCard({
  income,
  isLoading,
  isError,
}: HomeIncomeCardProps) {
  const { t } = useContentLanguage();
  if (isError) return null;

  const incomeRows = income.protocolRows.filter((row) => row.monthlyNetUsd > 0);
  const costRows = income.protocolRows.filter((row) => row.monthlyNetUsd < 0);

  return (
    <View>
      <SectionLabel>{t('home.passiveIncomeTitle')}</SectionLabel>
      <Card className="mt-3 px-4 py-4">
        {isLoading ? (
          <>
            <SkeletonBlock className="h-7 w-44" />
            <SkeletonBlock className="mt-3 h-4 w-64" />
          </>
        ) : income.status !== 'ready' ? (
          <Text className="text-[12px] leading-[18px] text-ink-dim">
            {t(
              income.status === 'insufficient'
                ? 'home.incomeInsufficient'
                : 'home.incomeEmpty',
            )}
          </Text>
        ) : (
          <>
            <Text className="font-serif text-[25px] leading-[31px] text-ink">
              {t('home.passiveIncomePerMonth', {
                amount: formatUsd(income.passiveMonthlyUsd),
              })}
            </Text>
            <Text className="mt-1.5 text-[11px] leading-[16px] text-ink-dim">
              {t('home.passiveIncomeBasis')}
            </Text>

            <View className="mt-3 flex-row gap-2">
              <View className="flex-1 flex-row items-center gap-1.5 rounded-xl border border-line bg-[rgba(255,255,255,.025)] px-3 py-2.5">
                <ArrowUpRight size={13} color="#d4c5a3" strokeWidth={2} />
                <Text className="font-mono-semibold text-[12px] text-accent">
                  {formatSignedUsd(income.incomeMonthlyUsd)}
                </Text>
              </View>
              <View className="flex-1 flex-row items-center gap-1.5 rounded-xl border border-line bg-[rgba(255,255,255,.025)] px-3 py-2.5">
                <ArrowDownRight size={13} color="#ef9292" strokeWidth={2} />
                <Text className="font-mono-semibold text-[12px] text-[#ef9292]">
                  {formatSignedUsd(income.costMonthlyUsd)}
                </Text>
              </View>
            </View>

            {income.protocolRows.length > 0 ? (
              <View className="mt-3 border-t border-line pt-1">
                {incomeRows.map((row) => (
                  <IncomeRow
                    key={`${row.protocol}:${row.chain ?? ''}:income`}
                    row={row}
                  />
                ))}
                {incomeRows.length > 0 && costRows.length > 0 ? (
                  <View className="my-1 h-px bg-line" />
                ) : null}
                {costRows.map((row) => (
                  <IncomeRow
                    key={`${row.protocol}:${row.chain ?? ''}:cost`}
                    row={row}
                  />
                ))}
              </View>
            ) : null}
          </>
        )}
      </Card>
    </View>
  );
}
