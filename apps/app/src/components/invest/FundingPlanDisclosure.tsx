import { CHAIN_BRAND } from '@zapengine/brand-assets';
import { Wallet } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { ChainTokenSelectorSheet } from '@/components/invest/ChainTokenSelectorSheet';
import { InvestLineItem } from '@/components/invest/InvestLineItem';
import { TokenIcon } from '@/components/token/TokenIcon';
import { Disclosure } from '@/components/ui/Disclosure';
import { Tap } from '@/components/ui/Tap';
import type { DesktopDepositToken } from '@/integration/depositTokens';
import {
  fundingPlanSummary,
  fundingSourceLabel,
  fundingRouteLabel,
  type FundingPlan,
} from '@/integration/investFundingPlanner';
import {
  INVEST_POSITIONS,
  type InvestPositionId,
} from '@/integration/investTargetsModel';
import { formatUsd6 } from '@/lib/format';
export function FundingPlanDisclosure({
  plan,
  hasAmount,
  isConnected,
  hasOverrides,
  onChangeSource,
  onUseRecommended,
  onOpenHlpSpotDeposit,
}: {
  plan: FundingPlan;
  hasAmount: boolean;
  isConnected: boolean;
  hasOverrides: boolean;
  onChangeSource: (id: InvestPositionId, token: DesktopDepositToken) => void;
  onUseRecommended: () => void;
  onOpenHlpSpotDeposit: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [picker, setPicker] = useState<InvestPositionId | null>(null);
  const count = new Set(plan.assignments.map((a) => a.source.token.chainId))
    .size;
  return (
    <View className="mt-4 rounded-[18px] border border-line px-4">
      <Disclosure
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        accessibilityLabel="How we'll fund this"
        header={
          <>
            <Wallet size={17} color="#a1a1aa" />
            <View className="flex-1">
              <Text className="text-[12px] text-ink">
                How we&apos;ll fund this
              </Text>
              <Text className="mt-1 text-[10px] text-ink-dim">
                {fundingPlanSummary(plan, { hasOverrides, isConnected })}
              </Text>
            </View>
          </>
        }
      >
        <Text className="text-[9px] uppercase text-ink-faint">Sources</Text>
        {INVEST_POSITIONS.filter((p) => plan.options[p.id]).map((p) => {
          const a = plan.assignments.find((a) => a.positionId === p.id);
          const canChange =
            plan.options[p.id]!.filter((o) => o.rejection === null).length > 1;
          return (
            <InvestLineItem
              key={p.id}
              icon={
                a ? (
                  <TokenIcon
                    symbol={a.source.token.symbol}
                    chainKey={a.source.token.chainKey}
                    size={28}
                    alt=""
                  />
                ) : undefined
              }
              title={p.venue}
              subtitle={
                a
                  ? `${fundingSourceLabel(a.source.token)} · ${fundingRouteLabel(a)}${a.pinned ? ' · Custom' : ''}`
                  : 'No balance can cover this'
              }
              value={a && hasAmount ? formatUsd6(a.usd6) : '—'}
              valueTone={a ? undefined : 'error'}
              divider
              trailing={
                canChange ? (
                  <Tap
                    accessibilityRole="button"
                    accessibilityLabel={`Change source for ${p.label}`}
                    onPress={() => setPicker(p.id)}
                  >
                    <Text className="mt-2 text-[10px] text-accent">
                      Change source
                    </Text>
                  </Tap>
                ) : undefined
              }
            />
          );
        })}
        <Text className="my-2 text-[10px] text-ink-dim">
          We keep about $5 of ETH on each chain for gas.
        </Text>
        {plan.warnings
          .filter((w) => w.kind !== 'eth-reserve-applied')
          .map((w) => {
            const chain = Object.values(CHAIN_BRAND).find(
              (c) => c.chainId === w.chainId,
            );
            return (
              <Text
                key={`${w.kind}:${w.chainId}`}
                className="my-1 text-[10px] text-ink-dim"
              >
                {chain?.label ?? `Chain ${w.chainId}`}{' '}
                {w.kind === 'low-gas'
                  ? 'has little ETH for gas.'
                  : 'balances were unavailable, so we used another chain.'}
              </Text>
            );
          })}
        <Text className="my-2 text-[10px] text-ink-dim">
          {count} wallet batches — one signature per source chain.
        </Text>
        {hasOverrides ? (
          <Tap accessibilityRole="button" onPress={onUseRecommended}>
            <Text className="py-2 text-[11px] text-accent">
              Use recommended
            </Text>
          </Tap>
        ) : null}
        {plan.options.hlp ? (
          <Tap accessibilityRole="link" onPress={onOpenHlpSpotDeposit}>
            <Text className="py-3 text-[11px] text-accent">
              Already have USDC on Hyperliquid? Deposit it directly
            </Text>
          </Tap>
        ) : null}
      </Disclosure>
      {picker ? (
        <ChainTokenSelectorSheet
          visible
          title="Change source"
          subtitle="Choose a balance that can cover this position."
          options={plan.options[picker] ?? []}
          selected={
            plan.assignments.find((a) => a.positionId === picker)?.source
              .token ?? null
          }
          onSelect={(token) => onChangeSource(picker, token)}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </View>
  );
}
