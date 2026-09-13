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
  minimumDepositUsd6ForScope,
  normalizeAmountInput,
  quickAmountUsdInput,
  requiredChainUnavailableForScope,
  strategyMaxTotalUsd,
} from '@/integration/investAmountModel';
import { useAccount } from '@/integration/useAccount';
import { useInvest } from '@/integration/useInvest';
import { useWalletAssets } from '@/integration/walletTokens';
import { formatUsd } from '@/lib/format';

type FundingBalanceState = 'loading' | 'unavailable' | 'loaded';

function fundingBalanceState({
  isConnected,
  requiredChainUnavailable,
  chainUnavailable,
  isLoading,
}: {
  isConnected: boolean;
  requiredChainUnavailable: boolean;
  chainUnavailable: boolean;
  isLoading: boolean;
}): FundingBalanceState {
  if (!isConnected || requiredChainUnavailable || chainUnavailable) {
    return 'unavailable';
  }
  return isLoading ? 'loading' : 'loaded';
}

function AllocationRow({
  title,
  detail,
  allocation,
}: {
  title: string;
  detail: string;
  allocation: string;
}) {
  return (
    <View className="flex-row items-center justify-between border-t border-line py-3">
      <View className="min-w-0 flex-1 pr-4">
        <Text className="font-sans-semibold text-[12px] text-ink">{title}</Text>
        <Text className="mt-0.5 text-[10.5px] leading-4 text-ink-dim">
          {detail}
        </Text>
      </View>
      <Text className="font-mono-semibold text-[12px] text-accent">
        {allocation}
      </Text>
    </View>
  );
}

/**
 * Portfolio-first Step 1. The UI intentionally hides chain/execution modes;
 * the current authoritative `both` plan remains the execution source of truth
 * while the planner is expanded to include HLP as a third destination.
 */
export function UnifiedInvestAmountScreen() {
  const router = useRouter();
  const account = useAccount();
  const invest = useInvest();
  const balances = useWalletAssets(account.address);

  useEffect(() => {
    if (invest.scope !== 'both') invest.setScope('both');
    if (invest.destination !== 'strategy') invest.setDestination('strategy');
  }, [invest]);

  const baseBalance = balanceForFundingToken(
    balances.chainRows,
    invest.baseFundingToken,
  );
  const arbitrumBalance = balanceForFundingToken(
    balances.chainRows,
    invest.arbitrumFundingToken,
  );
  const maxTotalUsd = strategyMaxTotalUsd({
    base: { token: invest.baseFundingToken, balance: baseBalance },
    arbitrum: { token: invest.arbitrumFundingToken, balance: arbitrumBalance },
  });
  const amountUsd = amountUsdFromInput(invest.amountInput);
  const amountUsd6 = BigInt(amountInputToUsd6(invest.amountInput));
  const maxAmountInput =
    maxTotalUsd === null ? '' : maxUsdAmountInput(maxTotalUsd);
  const maxUsd6 = BigInt(amountInputToUsd6(maxAmountInput));
  const requiredChainUnavailable = requiredChainUnavailableForScope(
    'both',
    balances.failedChains,
    balances.isError,
  );
  const minimumDepositUsd6 = minimumDepositUsd6ForScope('both');
  const exceedsBalance =
    maxTotalUsd !== null && amountUsd6 > 0n && amountUsd6 > maxUsd6;
  const hasBalances =
    BigInt(baseBalance?.balanceBaseUnits ?? '0') > 0n &&
    BigInt(arbitrumBalance?.balanceBaseUnits ?? '0') > 0n;
  const priceUnavailable =
    !requiredChainUnavailable &&
    !balances.isLoading &&
    maxTotalUsd === null &&
    hasBalances;
  const canReview =
    account.isConnected &&
    !requiredChainUnavailable &&
    !balances.isLoading &&
    amountUsd6 >= minimumDepositUsd6 &&
    !exceedsBalance &&
    maxTotalUsd !== null &&
    maxUsd6 > 0n;
  const quickAmountsDisabled =
    !account.isConnected ||
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
    4_000,
    invest.baseFundingToken,
    baseBalance,
  );
  const arbitrumTokenAmount = fundingTokenAmountFromUsd(
    amountUsd,
    6_000,
    invest.arbitrumFundingToken,
    arbitrumBalance,
  );
  const baseBalanceState = fundingBalanceState({
    isConnected: account.isConnected,
    requiredChainUnavailable,
    chainUnavailable:
      balances.isError || balances.failedChains.includes('base'),
    isLoading: balances.isLoading,
  });
  const arbitrumBalanceState = fundingBalanceState({
    isConnected: account.isConnected,
    requiredChainUnavailable,
    chainUnavailable:
      balances.isError || balances.failedChains.includes('arbitrum'),
    isLoading: balances.isLoading,
  });

  const handleQuickAmount = (bps: number) => {
    invest.setAmountInput(quickAmountUsdInput(maxTotalUsd, bps));
  };

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

  const amountNotice =
    amountUsd6 > 0n && amountUsd6 < minimumDepositUsd6
      ? 'Enter at least $10 to invest into the strategy.'
      : exceedsBalance
        ? 'This amount exceeds the strategy capacity of your current funding balances.'
        : priceUnavailable
          ? 'Live ETH pricing is unavailable, so an exact funding amount cannot be frozen yet.'
          : account.isConnected && !balances.isLoading && maxTotalUsd === 0
            ? 'Add a supported balance on both Base and Arbitrum to continue.'
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
          Choose an amount. Zap Pilot uses your supported wallet balances and
          prepares the cross-chain strategy for you.
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
            maxAccessibilityLabel="Use maximum strategy deposit supported by current balances"
            onSelect={handleQuickAmount}
          />
        </View>

        <View className="mt-4 rounded-[20px] border border-[rgba(212,197,163,.22)] bg-[rgba(212,197,163,.055)] px-4 pt-4">
          <View className="flex-row items-start justify-between pb-3">
            <View className="min-w-0 flex-1 pr-4">
              <Text className="font-sans-semibold text-[14px] text-accent">
                Balanced Yield
              </Text>
              <Text className="mt-1 text-[10.5px] leading-4 text-ink-dim">
                Current executable allocation while the unified HLP leg is
                being folded into the authoritative planner.
              </Text>
            </View>
            <View className="rounded-full bg-[rgba(143,211,168,.1)] px-2.5 py-1">
              <Text className="font-sans-semibold text-[9px] uppercase tracking-[.6px] text-[#8fd3a8]">
                Auto
              </Text>
            </View>
          </View>
          <AllocationRow
            title="Morpho"
            detail="Base · Moonwell USDC"
            allocation="40%"
          />
          <AllocationRow
            title="GMX"
            detail="Arbitrum · BTC/USDC + ETH/USDC"
            allocation="60%"
          />
        </View>

        <SwapArrowDivider />

        <Text className="mb-2 font-mono-semibold text-[9px] uppercase tracking-[.8px] text-ink-faint">
          Auto funding
        </Text>
        <View className="gap-2">
          <FundingSourceSelector
            chainKey="base"
            allocation="40%"
            protocol="morpho"
            venue="Moonwell USDC"
            tokens={BASE_DEPOSIT_TOKENS}
            token={invest.baseFundingToken}
            tokenAmount={baseTokenAmount}
            hasAmount={amountUsd !== null}
            allocatedUsd={(amountUsd ?? 0) * 0.4}
            balance={baseBalance}
            balanceState={baseBalanceState}
            rows={balances.chainRows}
            onSelectToken={invest.setBaseFundingToken}
          />
          <FundingSourceSelector
            chainKey="arbitrum"
            allocation="60%"
            protocol="gmx-v2"
            venue="BTC/USDC + ETH/USDC"
            tokens={ARBITRUM_DEPOSIT_TOKENS}
            token={invest.arbitrumFundingToken}
            tokenAmount={arbitrumTokenAmount}
            hasAmount={amountUsd !== null}
            allocatedUsd={(amountUsd ?? 0) * 0.6}
            balance={arbitrumBalance}
            balanceState={arbitrumBalanceState}
            rows={balances.chainRows}
            onSelectToken={invest.setArbitrumFundingToken}
          />
        </View>

        <View className="mt-3 flex-row items-start gap-2 rounded-xl bg-[rgba(212,197,163,.055)] px-3 py-2.5">
          <Info size={14} color="#9a8f78" style={{ marginTop: 1 }} />
          <Text className="flex-1 text-[10.5px] leading-[15px] text-[#9a8f78]">
            Funding chains are implementation details: the final unified planner
            will bridge only shortfalls and add HLP as another target position.
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
