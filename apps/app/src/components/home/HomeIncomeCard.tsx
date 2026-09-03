import { Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import type { HomeIncomeView } from '@/integration/homeIncomeModel';
import { formatSignedUsd, formatUsd } from '@/lib/format';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

interface HomeIncomeCardProps {
  income: HomeIncomeView;
  isLoading: boolean;
  isError: boolean;
}

export function HomeIncomeCard({
  income,
  isLoading,
  isError,
}: HomeIncomeCardProps) {
  const { t } = useContentLanguage();
  if (isError) return null;

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

            {income.protocolRows.length > 0 ? (
              <View className="mt-4 gap-2.5 border-t border-line pt-3">
                {income.protocolRows.map((row) => (
                  <View
                    key={`${row.protocol}:${row.chain ?? ''}`}
                    className="flex-row items-start justify-between gap-3"
                  >
                    <View className="min-w-0 flex-1">
                      <Text
                        numberOfLines={1}
                        className="text-[12.5px] text-ink"
                      >
                        {row.protocol}
                      </Text>
                      {row.chain ? (
                        <Text className="mt-0.5 font-mono text-[9.5px] text-ink-faint">
                          {row.chain}
                        </Text>
                      ) : null}
                    </View>
                    <View className="items-end">
                      <Text className="font-mono text-[12px] text-ink">
                        {formatSignedUsd(row.monthlyNetUsd)} /mo
                      </Text>
                      {row.monthlyLendingCostUsd === null ? null : (
                        <Text className="mt-0.5 font-mono text-[9.5px] text-ink-faint">
                          Lending{' '}
                          {formatSignedUsd(-Math.abs(row.monthlyLendingCostUsd))}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        )}
      </Card>
    </View>
  );
}
