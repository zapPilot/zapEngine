import { tokens } from '@zapengine/design-tokens/tokens';
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Layers,
  ShieldAlert,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { ProtocolIcon } from '@/components/token/ProtocolIcon';
import { TokenIcon } from '@/components/token/TokenIcon';
import { Card } from '@/components/ui/Card';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { Tap } from '@/components/ui/Tap';
import type { HomeBorrowingRiskView } from '@/integration/homeBorrowingRiskModel';
import {
  type HomeIncomePartition,
  type HomeIncomeView,
  type HomeProtocolIncomeRow,
  partitionIncomeRowsByCoverage,
} from '@/integration/homeIncomeModel';
import { formatPct, formatSignedUsd, formatUsd } from '@/lib/format';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

interface HomeIncomeCardProps {
  income: HomeIncomeView;
  borrowingRisk?: HomeBorrowingRiskView | null;
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

const BORROWING_RISK_COPY = {
  en: {
    title: 'Liquidation risk',
    toLiquidation: 'to liquidation',
    positions: 'positions',
    debt: 'debt',
    scenario:
      'Scenario estimate: collateral prices fall together while debt value stays flat.',
  },
  'zh-Hant': {
    title: '清算風險',
    toLiquidation: '距清算',
    positions: '個部位',
    debt: '負債',
    scenario: '情境估算：假設抵押品同步下跌，負債價值維持不變。',
  },
  ja: {
    title: '清算リスク',
    toLiquidation: '清算まで',
    positions: 'ポジション',
    debt: '負債',
    scenario:
      'シナリオ推定：担保価格が同率で下落し、負債価値は一定と仮定します。',
  },
} as const;

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

function OtherIncomeRow({ partition }: { partition: HomeIncomePartition }) {
  const { t } = useContentLanguage();
  const [expanded, setExpanded] = useState(false);
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const subtitle = [
    partition.otherIncomeUsd !== 0
      ? t('home.incomeOtherIncome', {
          amount: formatSignedUsd(partition.otherIncomeUsd),
        })
      : null,
    partition.otherCostUsd !== 0
      ? t('home.incomeOtherCost', {
          amount: formatSignedUsd(partition.otherCostUsd),
        })
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <Tap
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={t('home.incomeOtherA11y', {
          count: partition.other.length,
        })}
        onPress={() => setExpanded((current) => !current)}
        className="flex-row items-center gap-3 py-2"
      >
        <View className="h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line">
          <Layers size={16} strokeWidth={2} color={tokens.color['ink-faint']} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-[13px] text-ink">{t('home.incomeOther')}</Text>
          {subtitle ? (
            <Text
              numberOfLines={1}
              className="mt-0.5 font-mono text-[9.5px] text-ink-faint"
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Chevron size={14} strokeWidth={2} color={tokens.color['ink-faint']} />
      </Tap>
      {expanded
        ? partition.other.map((row) => (
            <IncomeRow
              key={`${row.protocol}:${row.chain ?? ''}:other`}
              row={row}
            />
          ))
        : null}
    </>
  );
}

function BorrowingRiskSection({ risk }: { risk: HomeBorrowingRiskView }) {
  const { languageCode } = useContentLanguage();
  const [expanded, setExpanded] = useState(false);
  const copy = BORROWING_RISK_COPY[languageCode];
  const Chevron = expanded ? ChevronDown : ChevronRight;
  const nearestBuffer = risk.nearestLiquidationBufferPct;
  const nearestLabel =
    nearestBuffer > 0 ? `−${formatPct(nearestBuffer)}` : formatPct(0);

  return (
    <View className="mt-3 border-t border-line pt-2">
      <Tap
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${copy.title}, ${nearestLabel} ${copy.toLiquidation}`}
        onPress={() => setExpanded((current) => !current)}
        className="flex-row items-center gap-3 py-2"
      >
        <View className="h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line">
          <ShieldAlert
            size={16}
            strokeWidth={2}
            color={tokens.color['ink-faint']}
          />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-[13px] text-ink">{copy.title}</Text>
          <Text
            numberOfLines={1}
            className="mt-0.5 font-mono text-[9.5px] text-ink-faint"
          >
            {risk.positionCount} {copy.positions} · {formatUsd(risk.totalDebtUsd)}{' '}
            {copy.debt}
          </Text>
        </View>
        <View className="items-end">
          <Text className="font-mono-semibold text-[12px] text-accent">
            {nearestLabel}
          </Text>
          <Text className="mt-0.5 text-[9.5px] text-ink-faint">
            {copy.toLiquidation}
          </Text>
        </View>
        <Chevron size={14} strokeWidth={2} color={tokens.color['ink-faint']} />
      </Tap>

      {expanded ? (
        <View className="mt-1 border-t border-line/70 pt-1">
          {risk.positions.map((position, index) => {
            const collateral = position.collateralSymbols.join(' + ') || '—';
            const debt = position.debtSymbols.join(' + ') || '—';
            const bufferLabel =
              position.liquidationBufferPct > 0
                ? `−${formatPct(position.liquidationBufferPct)}`
                : formatPct(0);

            return (
              <View
                key={`${position.protocol}:${position.chain}:${collateral}:${debt}:${index}`}
                accessible
                accessibilityLabel={`${position.protocol}, ${collateral} to ${debt}, ${bufferLabel} ${copy.toLiquidation}, HF ${position.healthRate.toFixed(2)}`}
                className="flex-row items-center gap-3 py-2"
              >
                <ProtocolIcon protocol={position.protocol} size={30} />
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="text-[12.5px] text-ink">
                    {position.protocol}
                  </Text>
                  <Text
                    numberOfLines={1}
                    className="mt-0.5 font-mono text-[9.5px] text-ink-faint"
                  >
                    {position.chain} · {collateral} → {debt}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="font-mono-semibold text-[11.5px] text-ink-dim">
                    {bufferLabel}
                  </Text>
                  <Text className="mt-0.5 font-mono text-[9.5px] text-ink-faint">
                    HF {position.healthRate.toFixed(2)}
                  </Text>
                </View>
              </View>
            );
          })}
          <Text className="mt-1 text-[9.5px] leading-[14px] text-ink-faint">
            {copy.scenario}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export function HomeIncomeCard({
  income,
  borrowingRisk = null,
  isLoading,
  isError,
}: HomeIncomeCardProps) {
  const { t } = useContentLanguage();
  // One pass over the rows, and above the `isError` guard: a hook placed after
  // an early return is a conditional call.
  const { partition, incomeRows, costRows, showGrossSplit } = useMemo(() => {
    const grouped = partitionIncomeRowsByCoverage(income.protocolRows);
    return {
      partition: grouped,
      incomeRows: grouped.visible.filter((row) => row.monthlyNetUsd > 0),
      costRows: grouped.visible.filter((row) => row.monthlyNetUsd < 0),
      // The gross pair only earns its space when it explains a headline that
      // nets two sides against each other.
      showGrossSplit:
        income.protocolRows.some((row) => row.monthlyNetUsd > 0) &&
        income.protocolRows.some((row) => row.monthlyNetUsd < 0),
    };
  }, [income.protocolRows]);

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
                {incomeRows.length > 0 && costRows.length > 0 ? (
                  <View className="my-1 h-px bg-line" />
                ) : null}
                {costRows.map((row) => (
                  <IncomeRow
                    key={`${row.protocol}:${row.chain ?? ''}:cost`}
                    row={row}
                  />
                ))}
                {partition.other.length > 0 ? (
                  <OtherIncomeRow partition={partition} />
                ) : null}
              </View>
            ) : null}
          </>
        )}

        {!isLoading && borrowingRisk ? (
          <BorrowingRiskSection risk={borrowingRisk} />
        ) : null}
      </Card>
    </View>
  );
}
