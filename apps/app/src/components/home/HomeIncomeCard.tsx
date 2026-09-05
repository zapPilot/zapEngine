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

const PROTOCOL_ICON_SIZE = 36;
const TOKEN_BADGE_SIZE = 17;
const TOKEN_BADGE_BORDER = 1;
const TOKEN_BADGE_WIDTH = TOKEN_BADGE_SIZE + TOKEN_BADGE_BORDER * 2;
const TOKEN_BADGE_LEFT = 25;
const TOKEN_BADGE_STEP = 11;
const MAX_VISIBLE_TOKENS = 3;

/** Widest point of the stack, so overlapping badges never cover the row text. */
function positionIconWidth(tokenCount: number): number {
  if (tokenCount === 0) return PROTOCOL_ICON_SIZE;
  return (
    TOKEN_BADGE_LEFT + (tokenCount - 1) * TOKEN_BADGE_STEP + TOKEN_BADGE_WIDTH
  );
}

function PositionIcon({ row }: { row: HomeProtocolIncomeRow }) {
  const visibleTokens = row.tokenSymbols.slice(0, MAX_VISIBLE_TOKENS);

  return (
    <View
      className="relative h-11 shrink-0"
      style={{ width: positionIconWidth(visibleTokens.length) }}
    >
      <View className="absolute left-0 top-0">
        <ProtocolIcon protocol={row.protocol} size={PROTOCOL_ICON_SIZE} />
      </View>
      {visibleTokens.map((symbol, index) => (
        <View
          key={symbol}
          className="absolute rounded-full border border-[#0a0a0a] bg-[#0a0a0a]"
          style={{
            left: TOKEN_BADGE_LEFT + index * TOKEN_BADGE_STEP,
            top: TOKEN_BADGE_LEFT,
            zIndex: visibleTokens.length - index,
          }}
        >
          <TokenIcon symbol={symbol} size={TOKEN_BADGE_SIZE} alt={symbol} />
        </View>
      ))}
    </View>
  );
}

function IncomeRow({ row }: { row: HomeProtocolIncomeRow }) {
  const metadata = [row.chain, row.positionTypes[0]]
    .filter(Boolean)
    .join(' · ');
  const tokenLabel = row.tokenSymbols.join(' / ');
  const amount = formatSignedUsd(row.monthlyNetUsd);
  const isCost = row.monthlyNetUsd < 0;

  return (
    <View
      accessible
      accessibilityLabel={[row.protocol, metadata, tokenLabel, amount]
        .filter(Boolean)
        .join(', ')}
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
        {amount}
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
  // The gross pair only earns its space when it explains a headline that nets
  // two sides against each other.
  const showGrossSplit = incomeRows.length > 0 && costRows.length > 0;

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

            {showGrossSplit ? (
              <View className="mt-3 flex-row gap-2">
                <View
                  accessible
                  accessibilityLabel={t('home.passiveIncomeGrossA11y', {
                    amount: formatUsd(income.incomeMonthlyUsd),
                  })}
                  className="flex-1 flex-row items-center gap-1.5 rounded-xl border border-line bg-[rgba(255,255,255,.025)] px-3 py-2.5"
                >
                  <ArrowUpRight size={13} color="#d4c5a3" strokeWidth={2} />
                  <Text className="font-mono-semibold text-[12px] text-accent">
                    {formatSignedUsd(income.incomeMonthlyUsd)}
                  </Text>
                </View>
                <View
                  accessible
                  accessibilityLabel={t('home.passiveCostGrossA11y', {
                    amount: formatUsd(Math.abs(income.costMonthlyUsd)),
                  })}
                  className="flex-1 flex-row items-center gap-1.5 rounded-xl border border-line bg-[rgba(255,255,255,.025)] px-3 py-2.5"
                >
                  <ArrowDownRight size={13} color="#ef9292" strokeWidth={2} />
                  <Text className="font-mono-semibold text-[12px] text-[#ef9292]">
                    {formatSignedUsd(income.costMonthlyUsd)}
                  </Text>
                </View>
              </View>
            ) : null}

            {income.protocolRows.length > 0 ? (
              <View className="mt-3 border-t border-line pt-1">
                {incomeRows.map((row) => (
                  <IncomeRow
                    key={`${row.protocol}:${row.chain ?? ''}:income`}
                    row={row}
                  />
                ))}
                {showGrossSplit ? <View className="my-1 h-px bg-line" /> : null}
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
