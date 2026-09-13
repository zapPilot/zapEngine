import { useRouter } from 'expo-router';
import { Info } from 'lucide-react-native';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { CONNECT_WALLET_CTA } from '@/components/connect/connectCopy';
import { CONNECTING_LABEL } from '@/components/connect/connectGateCopy';
import { AllocationWeightRow } from '@/components/invest/AllocationWeightRow';
import { FundingSourceSelector } from '@/components/invest/FundingSourceSelector';
import { HlpAutoSourceCard } from '@/components/invest/HlpAutoSourceCard';
import { QuickAmountChips } from '@/components/invest/QuickAmountChips';
import { StepHeader } from '@/components/invest/StepHeader';
import { StepProgress } from '@/components/invest/StepProgress';
import { SwapArrowDivider } from '@/components/invest/SwapArrowDivider';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { Tap } from '@/components/ui/Tap';
import { isDevBuild } from '@/config/appCoreEnv';
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
import {
  bpsToPercentInput,
  buildStageDrafts,
  gmxBasketBudgetTooSmall,
  GMX_BASKET_EXECUTION_FEE_LABEL,
  INVEST_POSITIONS,
  isValidTargetAllocation,
  normalizePercentInput,
  percentInputToBps,
  requiredChainsUnavailable,
  selectHlpFundingSource,
  targetMaxTotalUsd,
  targetMinimumUsd6,
  targetUsd6Shares,
  weightBpsFor,
  type InvestPositionId,
} from '@/integration/investTargetsModel';
import { useAccount } from '@/integration/useAccount';
import { useInvest } from '@/integration/useInvest';
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

export function InvestAmountScreen() {
  const router = useRouter();
  const account = useAccount();
  const invest = useInvest();
  const balances = useWalletAssets(account.address);
  // The editor owns its own text so a half-typed "12." is not rounded away on
  // every keystroke; committed values live in the invest context as bps.
  const [percentEdits, setPercentEdits] = useState<
    Partial<Record<InvestPositionId, string>>
  >({});

  const allocations = invest.targetAllocations;
  const allocationValid = isValidTargetAllocation(allocations);
  const allocationTotalBps = allocations.reduce(
    (total, entry) => total + entry.weightBps,
    0,
  );
  const morphoBps = weightBpsFor(allocations, 'morpho-base');
  const gmxBps = weightBpsFor(allocations, 'gmx-arbitrum');
  const hlpBps = weightBpsFor(allocations, 'hlp');

  const baseBalance = balanceForFundingToken(
    balances.chainRows,
    invest.baseFundingToken,
  );
  const arbitrumBalance = balanceForFundingToken(
    balances.chainRows,
    invest.arbitrumFundingToken,
  );
  const maxTotalUsd = targetMaxTotalUsd({
    allocations,
    baseFundingToken: invest.baseFundingToken,
    arbitrumFundingToken: invest.arbitrumFundingToken,
    rows: balances.chainRows,
  });
  const amountUsd = amountUsdFromInput(invest.amountInput);
  const amountUsd6 = BigInt(amountInputToUsd6(invest.amountInput));
  const minimumDepositUsd6 = targetMinimumUsd6(allocations);
  const maxAmountInput =
    maxTotalUsd === null ? '' : maxUsdAmountInput(maxTotalUsd);
  const maxUsd6 = BigInt(amountInputToUsd6(maxAmountInput));
  const exceedsBalance =
    maxTotalUsd !== null && amountUsd6 > 0n && amountUsd6 > maxUsd6;
  const chainUnavailable = requiredChainsUnavailable(
    allocations,
    balances.failedChains,
    balances.isError,
  );

  const shares =
    amountUsd6 > 0n
      ? targetUsd6Shares(amountUsd6.toString(), allocations)
      : null;
  const hlpFunding = shares
    ? selectHlpFundingSource({
        shares,
        baseFundingToken: invest.baseFundingToken,
        arbitrumFundingToken: invest.arbitrumFundingToken,
        rows: balances.chainRows,
      })
    : null;
  const hlpFundingUnavailable = hlpBps > 0 && shares !== null && !hlpFunding;

  const stageDrafts = buildStageDrafts({
    totalUsd6: amountUsd6.toString(),
    allocations,
    baseFundingToken: invest.baseFundingToken,
    arbitrumFundingToken: invest.arbitrumFundingToken,
    rows: balances.chainRows,
  });
  const gmxBudgetTooSmall = (stageDrafts ?? []).some(gmxBasketBudgetTooSmall);

  const canReview =
    account.isConnected &&
    allocationValid &&
    !chainUnavailable &&
    !balances.isLoading &&
    amountUsd6 >= minimumDepositUsd6 &&
    !exceedsBalance &&
    !gmxBudgetTooSmall &&
    stageDrafts !== null &&
    maxTotalUsd !== null &&
    maxUsd6 > 0n;
  const quickAmountsDisabled =
    !account.isConnected ||
    !allocationValid ||
    maxTotalUsd === null ||
    maxUsd6 <= 0n ||
    balances.isLoading ||
    chainUnavailable;
  const availableLabel = balances.isLoading
    ? 'Loading balances…'
    : chainUnavailable || !account.isConnected
      ? 'Available —'
      : maxTotalUsd === null
        ? 'Available — · USD price unavailable'
        : `Available ${formatUsd(maxTotalUsd)}`;

  const baseTokenAmount = fundingTokenAmountFromUsd(
    amountUsd,
    morphoBps,
    invest.baseFundingToken,
    baseBalance,
  );
  const arbitrumTokenAmount = fundingTokenAmountFromUsd(
    amountUsd,
    gmxBps,
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

  const handlePercentChange = (positionId: InvestPositionId, raw: string) => {
    const normalized = normalizePercentInput(raw);
    setPercentEdits((current) => ({ ...current, [positionId]: normalized }));
    invest.setTargetWeight(positionId, percentInputToBps(normalized));
  };

  const handlePrimaryAction = () => {
    if (!account.isConnected) {
      void account.connect();
      return;
    }
    if (chainUnavailable) {
      void balances.refetch();
      return;
    }
    if (!canReview || !stageDrafts) return;
    invest.setStageDrafts(stageDrafts);
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

  const amountNotice = !allocationValid
    ? `Allocation must total 100%. Current total: ${(allocationTotalBps / 100)
        .toFixed(2)
        .replace(/\.00$/u, '')}%.`
    : amountUsd6 > 0n && amountUsd6 < minimumDepositUsd6
      ? `Enter at least ${formatUsd(
          Number(minimumDepositUsd6) / 1_000_000,
        )} so every destination clears its own minimum.`
      : gmxBudgetTooSmall
        ? `Enter more than ${GMX_BASKET_EXECUTION_FEE_LABEL} for the GMX share — the four keeper fees come out of your ETH amount.`
        : exceedsBalance
          ? 'This amount exceeds the capacity of the selected wallet funding sources.'
          : hlpFundingUnavailable
            ? 'No single Ethereum, Base, or Arbitrum source can fully fund the HLP share once the other destinations are reserved.'
            : chainUnavailable
              ? 'Base or Arbitrum balances are unavailable. Retry to continue.'
              : maxTotalUsd === null &&
                  account.isConnected &&
                  !balances.isLoading
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
          required swaps, bridges, deposits, and the HLP follow-up.
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
              accessibilityLabel="Reset allocation to the default mix"
              className="rounded-full border border-[rgba(212,197,163,.25)] px-2.5 py-1"
              onPress={() => {
                setPercentEdits({});
                invest.resetTargetAllocations();
              }}
            >
              <Text className="font-sans-semibold text-[9px] uppercase tracking-[.6px] text-accent">
                Reset
              </Text>
            </Tap>
          </View>
          {INVEST_POSITIONS.map((position) => (
            <AllocationWeightRow
              key={position.id}
              title={position.label}
              detail={position.detail}
              percentInput={
                percentEdits[position.id] ??
                bpsToPercentInput(weightBpsFor(allocations, position.id))
              }
              onChangePercent={(value) =>
                handlePercentChange(position.id, value)
              }
            />
          ))}
        </View>

        <SwapArrowDivider />

        <Text className="mb-2 font-mono-semibold text-[9px] uppercase tracking-[.8px] text-ink-faint">
          Auto funding
        </Text>
        <View className="gap-2">
          {morphoBps > 0 ? (
            <FundingSourceSelector
              chainKey="base"
              allocation={`${morphoBps / 100}%`}
              protocol="morpho"
              venue="Morpho USDC vault"
              tokens={BASE_DEPOSIT_TOKENS}
              token={invest.baseFundingToken}
              tokenAmount={baseTokenAmount}
              hasAmount={amountUsd !== null}
              allocatedUsd={(amountUsd ?? 0) * (morphoBps / 10_000)}
              balance={baseBalance}
              balanceState={baseBalanceState}
              rows={balances.chainRows}
              onSelectToken={invest.setBaseFundingToken}
            />
          ) : null}
          {gmxBps > 0 ? (
            <FundingSourceSelector
              chainKey="arbitrum"
              allocation={`${gmxBps / 100}%`}
              protocol="gmx-v2"
              venue="Diversified GM basket"
              tokens={ARBITRUM_DEPOSIT_TOKENS}
              token={invest.arbitrumFundingToken}
              tokenAmount={arbitrumTokenAmount}
              hasAmount={amountUsd !== null}
              allocatedUsd={(amountUsd ?? 0) * (gmxBps / 10_000)}
              balance={arbitrumBalance}
              balanceState={arbitrumBalanceState}
              rows={balances.chainRows}
              onSelectToken={invest.setArbitrumFundingToken}
            />
          ) : null}
          {hlpBps > 0 ? (
            <HlpAutoSourceCard
              weightBps={hlpBps}
              funding={hlpFunding}
              hasAmount={amountUsd6 > 0n}
            />
          ) : null}
        </View>

        <View className="mt-3 flex-row items-start gap-2 rounded-xl bg-[rgba(212,197,163,.055)] px-3 py-2.5">
          <Info size={14} color="#9a8f78" style={{ marginTop: 1 }} />
          <Text className="flex-1 text-[10.5px] leading-[15px] text-[#9a8f78]">
            Each destination is its own reviewed wallet batch. HLP funded from
            Arbitrum USDC goes straight into Hyperliquid&apos;s Bridge2 escrow;
            Base or Ethereum funding bridges to Hyperliquid through LI.FI in one
            batch. The vault deposit itself is signed by your approved
            Hyperliquid agent.
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
