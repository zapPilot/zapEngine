import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { CONNECT_WALLET_CTA } from '@/components/connect/connectCopy';
import { CONNECTING_LABEL } from '@/components/connect/connectGateCopy';
import { QuickAmountChips } from '@/components/invest/QuickAmountChips';
import { StepHeader } from '@/components/invest/StepHeader';
import { StepProgress } from '@/components/invest/StepProgress';
import { SectorAllocationBar } from '@/components/invest/SectorAllocationBar';
import { SectorCard } from '@/components/invest/SectorCard';
import { FundingPlanDisclosure } from '@/components/invest/FundingPlanDisclosure';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { Tap } from '@/components/ui/Tap';
import { isDevBuild } from '@/config/appCoreEnv';
import {
  normalizeAmountInput,
  quickAmountUsdInput,
} from '@/integration/investAmountModel';
import {
  bpsToPercentInput,
  normalizePercentInput,
  percentInputToBps,
  targetMinimumUsd6,
  targetUsd6Shares,
} from '@/integration/investTargetsModel';
import {
  INVEST_SECTORS,
  isDefaultSectorWeights,
  sectorUsd6Shares,
  type InvestSectorId,
} from '@/integration/investSectorModel';
import {
  planFunding,
  fundingCapacityUsd6,
  unavailableChainIds,
  unavailableFundingChains,
  fundingBlockerMessage,
  NATIVE_GAS_RESERVE_USD,
} from '@/integration/investFundingPlanner';
import { requestAccountConnection } from '@/integration/requestAccountConnection';
import { useAccount } from '@/integration/useAccount';
import { useInvest } from '@/integration/useInvest';
import { useWalletAssets } from '@/integration/walletTokens';
import { formatUsd6 } from '@/lib/format';

export function InvestAmountScreen() {
  const router = useRouter();
  const account = useAccount();
  const invest = useInvest();
  const balances = useWalletAssets(account.address);
  const [percentEdit, setPercentEdit] = useState<{
    sectorId: InvestSectorId;
    text: string;
  } | null>(null);
  const supply = {
    rows: balances.chainRows,
    unavailableChainIds: unavailableChainIds(balances.failedChains),
  };
  const constraints = {
    overrides: invest.fundingOverrides,
    gasReserveUsd: NATIVE_GAS_RESERVE_USD,
  };
  const minimumUsd6 = targetMinimumUsd6(invest.targetAllocations);
  const amountUsd6 = BigInt(invest.totalUsd6);
  const capacityUsd6 = fundingCapacityUsd6({
    allocations: invest.targetAllocations,
    supply,
    constraints,
  });
  const plan = planFunding({
    demand: {
      totalUsd6: amountUsd6 > 0n ? invest.totalUsd6 : minimumUsd6.toString(),
      allocations: invest.targetAllocations,
    },
    supply,
    constraints,
  });
  const chainUnavailable =
    balances.isError ||
    unavailableFundingChains(
      invest.targetAllocations,
      supply.unavailableChainIds,
      invest.fundingOverrides,
    );
  const canReview =
    account.isConnected &&
    !balances.isLoading &&
    !chainUnavailable &&
    amountUsd6 >= minimumUsd6 &&
    capacityUsd6 !== null &&
    amountUsd6 <= capacityUsd6 &&
    plan.stages !== null;
  const quickAmountsDisabled =
    !account.isConnected ||
    balances.isLoading ||
    chainUnavailable ||
    capacityUsd6 === null ||
    capacityUsd6 <= 0n;
  const availableLabel = balances.isLoading
    ? 'Loading balances…'
    : chainUnavailable || !account.isConnected
      ? 'Available —'
      : capacityUsd6 === null
        ? 'Available — · USD price unavailable'
        : `Available ${formatUsd6(capacityUsd6)}`;
  const amountNotice =
    amountUsd6 <= 0n
      ? null
      : amountUsd6 < minimumUsd6
        ? `Enter at least ${formatUsd6(minimumUsd6)} so every position clears its own minimum.`
        : capacityUsd6 !== null && amountUsd6 > capacityUsd6
          ? 'This amount is more than your wallet can fund right now.'
          : plan.blockers[0]
            ? fundingBlockerMessage(plan.blockers[0])
            : null;
  const sectorShares = sectorUsd6Shares(invest.totalUsd6, invest.sectorWeights);
  const shares = targetUsd6Shares(invest.totalUsd6, invest.targetAllocations);
  const handlePrimaryAction = () => {
    if (!account.isConnected) {
      requestAccountConnection(account);
      return;
    }
    if (chainUnavailable) {
      void balances.refetch();
      return;
    }
    if (!canReview || !plan.stages) return;
    invest.setStageDrafts(plan.stages);
    router.push('/invest/route');
  };
  const primaryLabel = !account.isConnected
    ? account.isConnecting
      ? CONNECTING_LABEL
      : CONNECT_WALLET_CTA
    : chainUnavailable
      ? 'Retry balances'
      : balances.isLoading
        ? 'Loading balances…'
        : 'Preview investment';
  return (
    <ScreenScrollView>
      <StepHeader title="Invest" step="Step 1 of 2" />
      <StepProgress current={1} />
      <View className="px-5 pt-5">
        <Text className="font-serif text-[28px] leading-[32px] text-ink">
          How much do you want to invest?
        </Text>
        <Text className="mt-2 text-[12.5px] leading-[19px] text-ink-dim">
          Pick an amount and a mix. Zap Pilot handles the rest — you review
          everything before anything is signed.
        </Text>
        <View className="mt-5 rounded-[22px] border border-line bg-[#111113] p-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-[11px] text-ink-dim">You invest</Text>
            <Text className="font-mono text-[10.5px] text-ink-dim">
              {availableLabel}
            </Text>
          </View>
          <View className="mt-2 flex-row items-center">
            <Text className="mr-2 font-sans-semibold text-[30px] text-ink-faint">
              $
            </Text>
            <TextInput
              accessibilityLabel="Total investment in US dollars"
              className="min-w-0 flex-1 font-sans-semibold text-[42px] leading-[48px] text-ink"
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor="#52525b"
              selectionColor="#d4c5a3"
              value={invest.amountInput}
              onChangeText={(value) =>
                invest.setAmountInput(normalizeAmountInput(value))
              }
            />
            <View className="rounded-full bg-[#242427] px-3 py-2">
              <Text className="font-sans-semibold text-[12px] text-ink-dim">
                USD
              </Text>
            </View>
          </View>
          <QuickAmountChips
            disabled={quickAmountsDisabled}
            maxAccessibilityLabel="Use maximum investment supported by current balances"
            onSelect={(bps) =>
              invest.setAmountInput(quickAmountUsdInput(capacityUsd6, bps))
            }
          />
        </View>

        <View className="mt-5 flex-row items-center justify-between">
          <Text className="font-sans-semibold text-[16px] text-ink">
            Your mix
          </Text>
          {!isDefaultSectorWeights(invest.sectorWeights) ? (
            <Tap
              accessibilityRole="button"
              accessibilityLabel="Reset to the recommended mix"
              onPress={() => {
                setPercentEdit(null);
                invest.resetSectorWeights();
              }}
            >
              <Text className="text-[11px] text-accent">Reset</Text>
            </Tap>
          ) : null}
        </View>
        <Text className="mt-2 text-[11px] text-ink-dim">
          Recommended 60 / 40. Adjust one sector and the rest rebalances.
        </Text>
        <SectorAllocationBar weights={invest.sectorWeights} />
        <View className="gap-3">
          {INVEST_SECTORS.map((sector) => (
            <SectorCard
              key={sector.id}
              sector={sector}
              totalUsd6={amountUsd6 > 0n ? sectorShares[sector.id] : null}
              percentInput={
                percentEdit?.sectorId === sector.id
                  ? percentEdit.text
                  : bpsToPercentInput(invest.sectorWeights[sector.id])
              }
              positions={sector.positions.map((p) => ({
                ...p,
                usd6: shares?.[p.positionId] ?? null,
              }))}
              onChangePercent={(raw) => {
                const text = normalizePercentInput(raw);
                setPercentEdit({ sectorId: sector.id, text });
                invest.setSectorWeight(sector.id, percentInputToBps(text));
              }}
              onBlurPercent={() => setPercentEdit(null)}
            />
          ))}
        </View>
        <FundingPlanDisclosure
          plan={plan}
          hasAmount={amountUsd6 > 0n}
          isConnected={account.isConnected}
          hasOverrides={Object.keys(invest.fundingOverrides).length > 0}
          onChangeSource={invest.setFundingOverride}
          onUseRecommended={invest.clearFundingOverrides}
          onOpenHlpSpotDeposit={() => router.push('/invest/hlp-deposit')}
        />
        {amountNotice ? (
          <Text
            accessibilityRole="alert"
            className="mt-3 text-[11px] text-error"
          >
            {amountNotice}
          </Text>
        ) : null}
        <PrimaryButton
          className="mt-4"
          disabled={
            account.isConnecting ||
            (account.isConnected && !chainUnavailable && !canReview)
          }
          onPress={handlePrimaryAction}
        >
          {primaryLabel}
        </PrimaryButton>
        {isDevBuild() ? (
          <Tap
            accessibilityRole="link"
            accessibilityLabel="Open bridge diagnostics"
            className="mt-4 self-center"
            onPress={() => router.push('/invest/bridge')}
          >
            <Text className="text-[10.5px] text-ink-faint underline">
              Bridge diagnostics
            </Text>
          </Tap>
        ) : null}
      </View>
    </ScreenScrollView>
  );
}
