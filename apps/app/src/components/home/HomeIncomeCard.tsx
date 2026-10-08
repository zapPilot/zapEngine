import { cn } from '@/lib/cn';
import { Icon } from '@/components/ui/Icon';
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Layers,
  ShieldAlert,
} from 'lucide-react-native';
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Text, View } from 'react-native';

import { ProtocolIcon } from '@/components/token/ProtocolIcon';
import { TokenIcon } from '@/components/token/TokenIcon';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { Tap } from '@/components/ui/Tap';
import type { HomeBorrowingRiskView } from '@/integration/homeBorrowingRiskModel';
import {
  type HomeIncomePartition,
  type HomeIncomeView,
  type HomeProtocolIncomeRow,
  partitionIncomeRowsByCoverage,
} from '@/integration/homeIncomeModel';
import {
  formatPct,
  formatSignedPct,
  formatSignedUsd,
  formatUsd,
} from '@/lib/format';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

interface HomeIncomeCardProps {
  income: HomeIncomeView;
  borrowingRisk?: HomeBorrowingRiskView | null;
  isLoading: boolean;
  isError: boolean;
}

const PROTOCOL_ICON_SIZE = 36;
const IconColumnWidth = createContext(PROTOCOL_ICON_SIZE);
const TOKEN_BADGE_SIZE = 17;
const TOKEN_BADGE_BORDER = 1;
const TOKEN_BADGE_WIDTH = TOKEN_BADGE_SIZE + TOKEN_BADGE_BORDER * 2;
const TOKEN_BADGE_LEFT = 25;
const TOKEN_BADGE_STEP = 11;
const MAX_VISIBLE_TOKENS = 3;

interface DisclosureRowProps {
  icon: ReactNode;
  title: string;
  subtitle?: string | null;
  trailing?: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  accessibilityLabel: string;
}

function DisclosureRow({
  icon,
  title,
  subtitle,
  trailing,
  expanded,
  onToggle,
  accessibilityLabel,
}: DisclosureRowProps) {
  const iconColumnWidth = useContext(IconColumnWidth);
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <Tap
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={accessibilityLabel}
      onPress={onToggle}
      className="flex-row items-center gap-3 py-2"
    >
      <View style={{ width: iconColumnWidth }}>
        <View className="h-9 w-9 shrink-0 items-center justify-center rounded-panel border border-rule">
          {icon}
        </View>
      </View>
      <View className="min-w-0 flex-1">
        <Text className="font-text text-body-sm text-ink">{title}</Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            className="mt-0.5 font-mono text-data text-ink-3"
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      <Icon icon={Chevron} size="xs" tone="muted" />
    </Tap>
  );
}

/** Widest point of the stack, so overlapping badges never cover the row text. */
function positionIconWidth(tokenCount: number): number {
  if (tokenCount === 0) return PROTOCOL_ICON_SIZE;
  return (
    TOKEN_BADGE_LEFT + (tokenCount - 1) * TOKEN_BADGE_STEP + TOKEN_BADGE_WIDTH
  );
}

function PositionIcon({ row }: { row: HomeProtocolIncomeRow }) {
  const iconColumnWidth = useContext(IconColumnWidth);
  const visibleTokens = row.tokenSymbols.slice(0, MAX_VISIBLE_TOKENS);

  return (
    <View className="relative h-11 shrink-0" style={{ width: iconColumnWidth }}>
      <View className="absolute left-0 top-0">
        <ProtocolIcon protocol={row.protocol} size={PROTOCOL_ICON_SIZE} />
      </View>
      {visibleTokens.map((symbol, index) => (
        <View
          key={symbol}
          className="absolute rounded-round border border-ground bg-ground"
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

/** What the collapsed row hides: the rate its two visible numbers imply, and
 *  the tokens the protocol aggregate is actually made of. */
function IncomeRowDetail({ row }: { row: HomeProtocolIncomeRow }) {
  const { t } = useContentLanguage();
  const hasBorrowedLeg = row.tokenValues.some((token) => token.valueUsd < 0);

  return (
    <View className="mb-1 ml-3 border-l border-rule pl-3">
      {row.impliedAnnualPct === undefined ? null : (
        <Text className="py-1 font-mono text-data text-ink-2">
          {t('home.incomeImpliedRate', {
            rate: formatSignedPct(row.impliedAnnualPct),
          })}
        </Text>
      )}
      {row.tokenValues.length > 0 ? (
        <Text className="font-mono-medium mt-1 text-label text-ink-3">
          {t('home.incomeComposition')}
        </Text>
      ) : null}
      {row.tokenValues.map((token) => (
        <View
          key={token.symbol}
          accessible
          accessibilityLabel={`${token.symbol}, ${formatSignedUsd(
            token.valueUsd,
          )}`}
          className="flex-row items-center gap-2 py-1"
        >
          <TokenIcon
            symbol={token.symbol}
            size={TOKEN_BADGE_SIZE}
            alt={token.symbol}
          />
          <Text
            numberOfLines={1}
            className="font-mono-medium min-w-0 flex-1 text-label text-ink-2"
          >
            {token.symbol}
          </Text>
          <Text
            className={cn(
              'font-mono text-data',
              token.valueUsd < 0 ? 'text-down' : 'text-ink-2',
            )}
          >
            {formatSignedUsd(token.valueUsd)}
          </Text>
        </View>
      ))}
      {hasBorrowedLeg ? (
        <Text className="font-mono-medium mt-1 text-label leading-[14px] text-ink-3">
          {t('home.incomeCompositionBasis')}
        </Text>
      ) : null}
    </View>
  );
}

function IncomeRow({
  row,
  expandable = true,
}: {
  row: HomeProtocolIncomeRow;
  /** The rolled-up tail renders inside a disclosure already; a second level of
   *  taps there buys detail nobody went looking for. */
  expandable?: boolean;
}) {
  const { t } = useContentLanguage();
  const [expanded, setExpanded] = useState(false);
  const metadata = [row.chain, row.positionTypes[0]]
    .filter(Boolean)
    .join(' · ');
  const amount = formatSignedUsd(row.monthlyNetUsd);
  const isCost = row.monthlyNetUsd < 0;
  const positionLabel =
    row.positionValueUsd === undefined
      ? null
      : t('home.incomePositionValue', {
          amount: formatUsd(row.positionValueUsd),
        });
  const canExpand =
    expandable &&
    (row.tokenValues.length > 0 || row.impliedAnnualPct !== undefined);
  const accessibilityLabel = [row.label, metadata, positionLabel, amount]
    .filter(Boolean)
    .join(', ');
  const Chevron = expanded ? ChevronDown : ChevronRight;

  const summary = (
    <>
      <PositionIcon row={row} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="font-text text-body-sm text-ink">
          {row.label}
        </Text>
        {metadata ? (
          <Text
            numberOfLines={1}
            className="mt-0.5 font-mono text-data text-ink-3"
          >
            {metadata}
          </Text>
        ) : null}
      </View>
      <View className="items-end">
        <Text
          className={cn(
            'font-mono-semibold text-data',
            isCost ? 'text-down' : 'text-ink',
          )}
        >
          {amount}
        </Text>
        {positionLabel ? (
          <Text className="mt-0.5 font-mono text-data text-ink-3">
            {positionLabel}
          </Text>
        ) : null}
      </View>
      {/* Held open whether or not this row expands, so every amount in the
          card lines up against the same right edge. */}
      <View className="w-3.5 shrink-0 items-center">
        {canExpand ? <Icon icon={Chevron} size="xs" tone="muted" /> : null}
      </View>
    </>
  );

  if (!canExpand) {
    return (
      <View
        accessible
        accessibilityLabel={accessibilityLabel}
        className="flex-row items-center gap-3 py-2"
      >
        {summary}
      </View>
    );
  }

  return (
    <>
      <Tap
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={accessibilityLabel}
        onPress={() => setExpanded((current) => !current)}
        className="flex-row items-center gap-3 py-2"
      >
        {summary}
      </Tap>
      {expanded ? <IncomeRowDetail row={row} /> : null}
    </>
  );
}

function OtherIncomeRow({ partition }: { partition: HomeIncomePartition }) {
  const { t } = useContentLanguage();
  const [expanded, setExpanded] = useState(false);
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
      <DisclosureRow
        icon={<Icon icon={Layers} size="sm" tone="muted" />}
        title={t('home.incomeOther')}
        subtitle={subtitle || null}
        expanded={expanded}
        onToggle={() => setExpanded((current) => !current)}
        accessibilityLabel={t('home.incomeOtherA11y', {
          count: partition.other.length,
        })}
      />
      {expanded
        ? partition.other.map((row) => (
            <IncomeRow
              key={`${row.protocol}:${row.chain ?? ''}:other`}
              row={row}
              expandable={false}
            />
          ))
        : null}
    </>
  );
}

function BorrowingRiskSection({ risk }: { risk: HomeBorrowingRiskView }) {
  const { t } = useContentLanguage();
  const [expanded, setExpanded] = useState(false);
  const nearestBuffer = risk.nearestLiquidationBufferPct;
  const nearestLabel =
    nearestBuffer > 0 ? `−${formatPct(nearestBuffer)}` : formatPct(0);
  const title = t('home.liquidationRiskTitle');
  const toLiquidation = t('home.liquidationRiskToLiquidation');
  const summary = t('home.liquidationRiskSummary', {
    count: risk.positionCount,
    debt: formatUsd(risk.totalDebtUsd),
  });

  return (
    <View className="mt-3 border-t border-rule pt-2">
      <DisclosureRow
        icon={<Icon icon={ShieldAlert} size="sm" tone="muted" />}
        title={title}
        subtitle={summary}
        trailing={
          <View className="items-end">
            <Text className="font-mono-semibold text-data text-ink">
              {nearestLabel}
            </Text>
            <Text className="font-mono-medium mt-0.5 text-label text-ink-3">
              {toLiquidation}
            </Text>
          </View>
        }
        expanded={expanded}
        onToggle={() => setExpanded((current) => !current)}
        accessibilityLabel={t('home.liquidationRiskA11y', {
          buffer: nearestLabel,
        })}
      />

      {expanded ? (
        <View className="mt-1 border-t border-rule/70 pt-1">
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
                accessibilityLabel={t('home.liquidationRiskPositionA11y', {
                  protocol: position.protocol,
                  collateral,
                  debt,
                  buffer: bufferLabel,
                  healthRate: position.healthRate.toFixed(2),
                })}
                className="flex-row items-center gap-3 py-2"
              >
                <ProtocolIcon protocol={position.protocol} size={30} />
                <View className="min-w-0 flex-1">
                  <Text
                    numberOfLines={1}
                    className="font-text text-caption text-ink"
                  >
                    {position.protocol}
                  </Text>
                  <Text
                    numberOfLines={1}
                    className="mt-0.5 font-mono text-data text-ink-3"
                  >
                    {position.chain} · {collateral} → {debt}
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="font-mono-semibold text-data text-ink-2">
                    {bufferLabel}
                  </Text>
                  <Text className="mt-0.5 font-mono text-data text-ink-3">
                    HF {position.healthRate.toFixed(2)}
                  </Text>
                </View>
              </View>
            );
          })}
          <Text className="font-mono-medium mt-1 text-label leading-[14px] text-ink-3">
            {t('home.liquidationRiskScenario')}
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
    <IconColumnWidth.Provider
      value={Math.max(
        PROTOCOL_ICON_SIZE,
        ...income.protocolRows.map((row) =>
          positionIconWidth(
            Math.min(row.tokenSymbols.length, MAX_VISIBLE_TOKENS),
          ),
        ),
      )}
    >
      <View>
        <SectionHeader title={t('home.passiveIncomeTitle')} />
        <Card className="mt-3 px-4 py-4">
          {isLoading ? (
            <>
              <SkeletonBlock className="h-7 w-44" />
              <SkeletonBlock className="mt-3 h-4 w-64" />
            </>
          ) : income.status !== 'ready' ? (
            <Text className="font-text text-caption leading-[18px] text-ink-2">
              {t(
                income.status === 'insufficient'
                  ? 'home.incomeInsufficient'
                  : 'home.incomeEmpty',
              )}
            </Text>
          ) : (
            <>
              <Text className="font-display text-title leading-[31px] text-ink">
                {t('home.passiveIncomePerMonth', {
                  amount: formatUsd(income.passiveMonthlyUsd),
                })}
              </Text>
              <Text className="font-mono-medium mt-1.5 text-label leading-[16px] text-ink-2">
                {t('home.passiveIncomeBasis')}
              </Text>

              {showGrossSplit ? (
                <View className="mt-3 flex-row gap-2">
                  <View
                    accessible
                    accessibilityLabel={t('home.passiveIncomeGrossA11y', {
                      amount: formatUsd(income.incomeMonthlyUsd),
                    })}
                    className="flex-1 flex-row items-center gap-1.5 rounded-panel border border-rule bg-well px-3 py-2.5"
                  >
                    <Icon icon={ArrowUpRight} size="xs" tone="sign" />
                    <Text className="font-mono-semibold text-data text-ink">
                      {formatSignedUsd(income.incomeMonthlyUsd)}
                    </Text>
                  </View>
                  <View
                    accessible
                    accessibilityLabel={t('home.passiveCostGrossA11y', {
                      amount: formatUsd(Math.abs(income.costMonthlyUsd)),
                    })}
                    className="flex-1 flex-row items-center gap-1.5 rounded-panel border border-rule bg-well px-3 py-2.5"
                  >
                    <Icon icon={ArrowDownRight} size="xs" tone="default" />
                    <Text className="font-mono-semibold text-data text-alert">
                      {formatSignedUsd(income.costMonthlyUsd)}
                    </Text>
                  </View>
                </View>
              ) : null}

              {income.protocolRows.length > 0 ? (
                <View className="mt-3 border-t border-rule pt-1">
                  {incomeRows.map((row) => (
                    <IncomeRow
                      key={`${row.protocol}:${row.chain ?? ''}:income`}
                      row={row}
                    />
                  ))}
                  {incomeRows.length > 0 && costRows.length > 0 ? (
                    <View className="my-1 h-px bg-rule" />
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
    </IconColumnWidth.Provider>
  );
}
