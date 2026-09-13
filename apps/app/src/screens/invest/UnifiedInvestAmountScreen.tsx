import { CHAIN_BRAND } from '@zapengine/brand-assets';
import { useRouter } from 'expo-router';
import { Info } from 'lucide-react-native';
import { useEffect } from 'react';
import { Text, TextInput, View } from 'react-native';

import { CONNECT_WALLET_CTA } from '@/components/connect/connectCopy';
import { CONNECTING_LABEL } from '@/components/connect/connectGateCopy';
import { FundingSourceSelector } from '@/components/invest/FundingSourceSelector';
import { QuickAmountChips } from '@/components/invest/QuickAmountChips';
import { StepHeader } from '@/components/invest/StepHeader';
import { StepProgress } from '@/components/invest/StepProgress';
import { SwapArrowDivider } from '@/components/invest/SwapArrowDivider';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { Tap } from '@/components/ui/Tap';
import {
  ARBITRUM_DEPOSIT_TOKENS,
  BASE_DEPOSIT_TOKENS,
} from '@/integration/depositTokens';
import {
  amountInputToUsd6,
  amountUsdFromInput,
  balanceForFundingToken,
  fundingTokenAmountFromUsd,
  maxUsdAmountInput,
  normalizeAmountInput,
  quickAmountUsdInput,
} from '@/integration/investAmountModel';
import { useAccount } from '@/integration/useAccount';
import { useInvest } from '@/integration/useInvest';
import { useUnifiedInvest } from '@/integration/useUnifiedInvest';
import {
  isValidUnifiedAllocation,
  selectUnifiedHlpFundingSource,
  unifiedInvestMinimumUsd6,
  unifiedStrategyMaxTotalUsd,
  type UnifiedInvestTargetId,
} from '@/integration/unifiedInvestModel';
import { useWalletAssets } from '@/integration/walletTokens';
import { formatUsd } from '@/lib/format';

type FundingBalanceState = 'loading' | 'unavailable' | 'loaded';

function fundingBalanceState({
  isConnected,
  chainUnavailable,
  isLoading,
}: {
  isConnected: boolean;
  chainUnavailable: boolean;
  isLoading: boolean;
}): FundingBalanceState {
  if (!isConnected || chainUnavailable) return 'unavailable';
  return isLoading ? 'loading' : 'loaded';
}

function AllocationInputRow({
  id,
  title,
  detail,
  bps,
  onChange,
}: {
  id: UnifiedInvestTargetId;
  title: string;
  detail: string;
  bps: number;
  onChange: (id: UnifiedInvestTargetId, bps: number) => void;
}) {
  return (
    <View className="flex-row items-center justify-between border-t border-line py-3">
      <View className="min-w-0 flex-1 pr-4">
        <Text className="font-sans-semibold text-[12px] text-ink">{title}</Text>
        <Text className="mt-0.5 text-[10.5px] leading-4 text-ink-dim">
          {detail}
        </Text>
      </View>
      <View className="flex-row items-center rounded-xl border border-line bg-[#171719] px-2.5 py-1.5">
        <TextInput
          accessibilityLabel={`${title} allocation percentage`}
          className="w-12 text-right font-mono-semibold text-[12px] text-accent"
          keyboardType="decimal-pad"
          value={String(bps / 100)}
          onChangeText={(value) => {
            const parsed = Number(value.replace(/[^\d.]/gu, ''));
            onChange(id, Number.isFinite(parsed) ? parsed * 100 : 0);
          }}
        />
        <Text className="ml-1 font-mono-semibold text-[12px] text-accent">
          %
        </Text>
      </View>
    </View>
  );
}

export function UnifiedInvestAmountScreen() {
  const router = useRouter();
  const account = useAccount();
  const invest = useInvest();
  const unified = useUnifiedInvest();
  const balances = useWalletAssets(account.address);

  useEffect(() => {
    // Legacy scope/destination remain underneath for older internal routes;
    // the unified product surface owns allocation and routing from here.
    if (invest.scope !== 'both') invest.setScope('both');
    if (invest.destination !== 'strategy') invest.setDestination('strategy');
  }, [invest]);

  const allocation = unified.allocation;
  const allocationValid = isValidUnifiedAllocation(allocation);
  const allocationTotalBps =
    allocation.morphoBps + allocation.gmxBps + allocation.hlpBps;
  const baseBalance = balanceForFundingToken(
    balances.chainRows,
    invest.baseFundingToken,
  );
  const arbitrumBalance = balanceForFundingToken(
    balances.chainRows,
    invest.arbitrumFundingToken,
  );
  const maxTotalUsd = unifiedStrategyMaxTotalUsd({
    allocation,
    baseFundingToken: invest.baseFundingToken,
    arbitrumFundingToken: invest.arbitrumFundingToken,
    rows: balances.chainRows,
  });
  const amountUsd = amountUsdFromInput(invest.amountInput);
  const amountUsd6 = BigInt(amountInputToUsd6(invest.amountInput));
  const minimumDepositUsd6 = unifiedInvestMinimumUsd6(allocation);
  const maxAmountInput =
    maxTotalUsd === null ? '' : maxUsdAmountInput(maxTotalUsd);
  const maxUsd6 = BigInt(amountInputToUsd6(maxAmountInput));
  const exceedsBalance =
    maxTotalUsd !== null && amountUsd6 > 0n && amountUsd6 > maxUsd6;
  const requiredChainUnavailable =
    balances.isError ||
    (allocation.morphoBps > 0 && balances.failedChains.includes('base')) ||
    (allocation.gmxBps > 0 && balances.failedChains.includes('arbitrum'));
  const hlpFunding =
    allocationValid && amountUsd6 > 0n
      ? selectUnifiedHlpFundingSource({
          totalUsd6: amountUsd6.toString(),
          allocation,
          baseFundingToken: invest.baseFundingToken,
          arbitrumFundingToken: invest.arbitrumFundingToken,
          rows: balances.chainRows,
        })
      : null;
  const hlpFundingUnavailable = allocation.hlpBps > 0 && hlpFunding === null;
  const canReview =
    account.isConnected &&
    allocationValid &&
    !requiredChainUnavailable &&
    !balances.isLoading &&
    amountUsd6 >= minimumDepositUsd6 &&
    !exceedsBalance &&
    !hlpFundingUnavailable &&
    maxTotalUsd !== null &&
    maxUsd6 > 0n;
  const quickAmountsDisabled =
    !account.isConnected ||
    !allocationValid ||
    maxTotalUsd === null ||
    maxUsd6 <= 0n ||
    balances.isLoading ||
    requiredChainUnavailable;
  const availableLabel = balances.isLoading
    ? 'Loading balances…'
    : requiredChainUnavailable || !account.isConnected
      ? 'Available —'
      : maxTotalUsd === null
        ? 'Available — · USD price unavailable'
        : `Available ${formatUsd(maxTotalUsd)}`;

  const baseTokenAmount = fundingTokenAmountFromUsd(
    amountUsd,
    allocation.morphoBps,
    invest.baseFundingToken,
    baseBalance,
  );
  const arbitrumTokenAmount = fundingTokenAmountFromUsd(
    amountUsd,
    allocation.gmxBps,
    invest.arbitrumFundingToken,
    arbitrumBalance,
  );
  const baseBalanceState = fundingBalanceState({
    isConnected: account.isConnected,
    chainUnavailable:
      balances.isError || balances.failedChains.includes('base'),
    isLoading: balances.isLoading,
  });
  const arbitrumBalanceState = fundingBalanceState({
    isConnected: account.isConnected,
    chainUnavailable:
      balances.isError || balances.failedChains.includes('arbitrum'),
    isLoading: balances.isLoading,
  });

  const handlePrimaryAction = () => {
    if (!account.isConnected) {
      void account.connect();
      return;
    }
    if (requiredChainUnavailable) {
      void balances.refetch();
      return;
    }
    if (!canReview) return;
    invest.setSingleChainFundingDraft(null);
    router.push('/invest/route');
  };

  const primaryLabel = !account.isConnected
    ? account.isConnecting
      ? CONNECTING_LABEL
      : CONNECT_WALLET_CTA
    : requiredChainUnavailable
      ? 'Retry balances'
      : balances.isLoading
        ? 'Loading balances…'
        : 'Preview investment';

  const amountNotice = !allocationValid
    ? `Allocation must total 100%. Current total: ${(allocationTotalBps / 100).toFixed(2).replace(/\.00$/u, '')}%.`
    : amountUsd6 > 0n && amountUsd6 < minimumDepositUsd6
      ? `Enter at least ${formatUsd(Number(minimumDepositUsd6) / 1_000_000)} for this allocation and its destination minimums.`
      : exceedsBalance
        ? 'This amount exceeds the capacity of the selected wallet funding sources.'
        : hlpFundingUnavailable && amountUsd6 > 0n
          ? 'No single supported Ethereum, Base, or Arbitrum source can fully fund the HLP allocation after the other targets are reserved.'
          : maxTotalUsd === null && account.isConnected && !balances.isLoading
            ? 'Live ETH pricing is unavailable, so exact funding amounts cannot be frozen yet.'
            : null;

  return (
    <ScreenScrollView>
      <StepHeader title="Invest" step="Step 1 of 2" />
      <StepProgress current={1} />
      <View className="px-5 pt-5">
        <Text className="font-serif text-[28px] leading-[32px] text-ink">
          Invest in one flow
        </Text>
        <Text className="mt-2 text-[12.5px] leading-[19px] text-ink-dim">
          Enter one amount and your target weights. Zap Pilot resolves the
          required swaps, bridges, deposits, and HLP follow-up.
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
            maxAccessibilityLabel="Use maximum unified investment supported by current balances"
            onSelect={(bps) =>
              invest.setAmountInput(quickAmountUsdInput(maxTotalUsd, bps))
            }
          />
        </View>

        <View className="mt-4 rounded-[20px] border border-[rgba(212,197,163,.22)] bg-[rgba(212,197,163,.055)] px-4 pt-4">
          <View className="flex-row items-start justify-between pb-3">
            <View className="min-w-0 flex-1 pr-4">
              <Text className="font-sans-semibold text-[14px] text-accent">
                Balanced Yield
              </Text>
              <Text className="mt-1 text-[10.5px] leading-4 text-ink-dim">
                Edit the target mix. Zero disables a destination for this
                investment.
              </Text>
            </View>
            <Tap
              accessibilityRole="button"
              accessibilityLabel="Reset allocation to 40 35 25"
              className="rounded-full border border-[rgba(212,197,163,.25)] px-2.5 py-1"
              onPress={unified.resetAllocation}
            >
              <Text className="font-sans-semibold text-[9px] uppercase tracking-[.6px] text-accent">
                Reset
              </Text>
            </Tap>
          </View>
          <AllocationInputRow
            id="morpho"
            title="Morpho"
            detail="Base · Moonwell USDC"
            bps={allocation.morphoBps}
            onChange={unified.setTargetBps}
          />
          <AllocationInputRow
            id="gmx"
            title="GMX"
            detail="Arbitrum · diversified GM basket"
            bps={allocation.gmxBps}
            onChange={unified.setTargetBps}
          />
          <AllocationInputRow
            id="hlp"
            title="HLP"
            detail="Hyperliquid · official HLP vault"
            bps={allocation.hlpBps}
            onChange={unified.setTargetBps}
          />
        </View>

        <SwapArrowDivider />

        <Text className="mb-2 font-mono-semibold text-[9px] uppercase tracking-[.8px] text-ink-faint">
          Auto funding
        </Text>
        <View className="gap-2">
          {allocation.morphoBps > 0 ? (
            <FundingSourceSelector
              chainKey="base"
              allocation={`${allocation.morphoBps / 100}%`}
              protocol="morpho"
              venue="Moonwell USDC"
              tokens={BASE_DEPOSIT_TOKENS}
              token={invest.baseFundingToken}
              tokenAmount={baseTokenAmount}
              hasAmount={amountUsd !== null}
              allocatedUsd={
                (amountUsd ?? 0) * (allocation.morphoBps / 10_000)
              }
              balance={baseBalance}
              balanceState={baseBalanceState}
              rows={balances.chainRows}
              onSelectToken={invest.setBaseFundingToken}
            />
          ) : null}
          {allocation.gmxBps > 0 ? (
            <FundingSourceSelector
              chainKey="arbitrum"
              allocation={`${allocation.gmxBps / 100}%`}
              protocol="gmx-v2"
              venue="Diversified GM basket"
              tokens={ARBITRUM_DEPOSIT_TOKENS}
              token={invest.arbitrumFundingToken}
              tokenAmount={arbitrumTokenAmount}
              hasAmount={amountUsd !== null}
              allocatedUsd={(amountUsd ?? 0) * (allocation.gmxBps / 10_000)}
              balance={arbitrumBalance}
              balanceState={arbitrumBalanceState}
              rows={balances.chainRows}
              onSelectToken={invest.setArbitrumFundingToken}
            />
          ) : null}
          {allocation.hlpBps > 0 ? (
            <View className="rounded-[18px] border border-line bg-[#111113] p-4">
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="font-sans-semibold text-[12px] text-ink">
                    HLP · {allocation.hlpBps / 100}%
                  </Text>
                  <Text className="mt-1 text-[10.5px] text-ink-dim">
                    Auto-select one source for the full HLP allocation
                  </Text>
                </View>
                <Text className="font-mono text-[10px] uppercase text-accent">
                  Auto
                </Text>
              </View>
              <View className="mt-3 border-t border-line pt-3">
                <Text className="text-[10.5px] text-ink-dim">Funding route</Text>
                <Text className="mt-1 font-sans-semibold text-[11.5px] text-ink">
                  {hlpFunding
                    ? `${CHAIN_BRAND[hlpFunding.token.chainKey].label} ${hlpFunding.token.symbol} → ${hlpFunding.requiresArbitrumIngress ? 'Arbitrum USDC → ' : ''}Hyperliquid → HLP`
                    : amountUsd6 > 0n
                      ? 'No source can cover this allocation'
                      : 'Calculated after you enter an amount'}
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        <View className="mt-3 flex-row items-start gap-2 rounded-xl bg-[rgba(212,197,163,.055)] px-3 py-2.5">
          <Info size={14} color="#9a8f78" style={{ marginTop: 1 }} />
          <Text className="flex-1 text-[10.5px] leading-[15px] text-[#9a8f78]">
            HLP always enters through native Arbitrum USDC. Ethereum or Base
            funding first bridges to Arbitrum; Arbitrum USDC goes directly to
            Hyperliquid Bridge2 before the agent-signed HLP deposit.
          </Text>
        </View>

        {amountNotice ? (
          <Text className="mt-3 px-1 text-[11px] leading-4 text-error">
            {amountNotice}
          </Text>
        ) : null}

        <PrimaryButton
          className="mt-4"
          disabled={
            account.isConnecting ||
            (account.isConnected && !requiredChainUnavailable && !canReview)
          }
          onPress={handlePrimaryAction}
        >
          {primaryLabel}
        </PrimaryButton>
      </View>
    </ScreenScrollView>
  );
}