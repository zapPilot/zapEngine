import { useRouter } from 'expo-router';
import { Info } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import {
  CONNECT_WALLET_CTA,
  CONNECTING_LABEL,
} from '@/components/connect/connectCopy';
import { BridgeTestPanel } from '@/components/invest/BridgeTestPanel';
import { ChainTokenSelectorSheet } from '@/components/invest/ChainTokenSelectorSheet';
import { FundingSourceCard } from '@/components/invest/FundingSourceCard';
import { FundingSourceSelector } from '@/components/invest/FundingSourceSelector';
import { QuickAmountChips } from '@/components/invest/QuickAmountChips';
import { TokenSelectorPill } from '@/components/invest/TokenSelectorPill';
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
  buildSingleChainFundingDraft,
  fundingTokenAmountFromUsd,
  maxUsdAmountInput,
  minimumDepositUsd6ForScope,
  normalizeAmountInput,
  quickAmountUsdInput,
  requiredChainUnavailableForScope,
  spendableUsdForFundingToken,
  strategyMaxTotalUsd,
} from '@/integration/investAmountModel';
import { useAccount } from '@/integration/useAccount';
import { type InvestScope, useInvest } from '@/integration/useInvest';
import { useWalletAssets } from '@/integration/walletTokens';
import { formatUsd } from '@/lib/format';

type FundingBalanceState = 'loading' | 'unavailable' | 'loaded';

type InvestAmountTab = InvestScope | 'bridge';

const INVEST_SCOPE_OPTIONS: readonly {
  value: InvestAmountTab;
  label: string;
}[] = [
  { value: 'both', label: 'Both chains' },
  { value: 'base', label: 'Base only' },
  { value: 'arbitrum', label: 'Arbitrum only' },
  { value: 'bridge', label: 'Bridge' },
];

function fundingBalanceState({
  isConnected,
  isBoth,
  requiredChainUnavailable,
  chainUnavailable,
  isLoading,
}: {
  isConnected: boolean;
  isBoth: boolean;
  requiredChainUnavailable: boolean;
  chainUnavailable: boolean;
  isLoading: boolean;
}): FundingBalanceState {
  if (!isConnected || (isBoth ? requiredChainUnavailable : chainUnavailable)) {
    return 'unavailable';
  }
  return isLoading ? 'loading' : 'loaded';
}

interface AmountNotice {
  message: string;
  className: string;
}

function amountNotice({
  belowMinimum,
  exceedsBalance,
  requiredChainUnavailable,
  priceUnavailable,
  noSupportedBalance,
  isBoth,
  isBaseOnly,
  activeChainLabel,
}: {
  belowMinimum: boolean;
  exceedsBalance: boolean;
  requiredChainUnavailable: boolean;
  priceUnavailable: boolean;
  noSupportedBalance: boolean;
  isBoth: boolean;
  isBaseOnly: boolean;
  activeChainLabel: string;
}): AmountNotice | null {
  if (belowMinimum) {
    return {
      className: 'mt-2.5 px-1 text-[11px] text-error',
      message: isBaseOnly
        ? 'Enter at least $0.01 to test the Base Morpho deposit.'
        : isBoth
          ? 'Enter at least $10 to deposit into the strategy.'
          : 'Enter at least $1 — GMX keeper fees make smaller deposits uneconomical.',
    };
  }
  if (exceedsBalance) {
    return {
      className: 'mt-2.5 px-1 text-[11px] text-error',
      message: isBoth
        ? 'This amount exceeds the available balance on at least one chain.'
        : `This amount exceeds the available ${activeChainLabel} balance.`,
    };
  }
  if (requiredChainUnavailable) {
    return {
      className: 'mt-2.5 px-1 text-[11px] text-error',
      message: isBoth
        ? 'Base or Arbitrum balances are unavailable. Retry to continue.'
        : `${activeChainLabel} balances are unavailable. Retry to continue.`,
    };
  }
  if (priceUnavailable) {
    return {
      className: 'mt-2.5 px-1 text-[11px] leading-[16px] text-ink-dim',
      message:
        'Live ETH pricing is unavailable, so this deposit cannot freeze an exact funding amount yet.',
    };
  }
  if (noSupportedBalance) {
    return {
      className: 'mt-2.5 px-1 text-[11px] text-ink-dim',
      message: isBoth
        ? 'No supported balance is available on both Base and Arbitrum.'
        : `No supported balance is available on ${activeChainLabel}.`,
    };
  }
  return null;
}

function InvestScopeToggle({
  value,
  onChange,
}: {
  value: InvestAmountTab;
  onChange: (scope: InvestAmountTab) => void;
}) {
  return (
    <View
      accessibilityLabel="Deposit scope"
      accessibilityRole="radiogroup"
      className="mt-4 flex-row rounded-[14px] border border-line bg-[#111113] p-1"
    >
      {INVEST_SCOPE_OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <Tap
            key={option.value}
            accessibilityLabel={option.label}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            className="min-h-11 flex-1 items-center justify-center rounded-[10px] px-2"
            style={
              selected
                ? {
                    backgroundColor: 'rgba(212,197,163,.14)',
                    borderColor: 'rgba(212,197,163,.28)',
                    borderWidth: 1,
                  }
                : undefined
            }
            onPress={() => onChange(option.value)}
          >
            <Text
              className={`text-center font-sans-semibold text-[11px] ${
                selected ? 'text-accent' : 'text-ink-dim'
              }`}
            >
              {option.label}
            </Text>
          </Tap>
        );
      })}
    </View>
  );
}

export function InvestAmountScreen() {
  const router = useRouter();
  const account = useAccount();
  const invest = useInvest();
  const balances = useWalletAssets(account.address);
  const [activeTab, setActiveTab] = useState<InvestAmountTab>(invest.scope);
  const [singleChainTokenSelector, setSingleChainTokenSelector] = useState<
    'base' | 'arbitrum' | null
  >(null);
  const isBoth = invest.scope === 'both';
  const isBaseOnly = invest.scope === 'base';
  const activeChainLabel = isBaseOnly ? 'Base' : 'Arbitrum';
  const activeArbitrumFundingToken = invest.arbitrumFundingToken;
  const activeFundingToken = isBaseOnly
    ? invest.baseFundingToken
    : activeArbitrumFundingToken;
  const activeFundingTokens = isBaseOnly
    ? BASE_DEPOSIT_TOKENS
    : ARBITRUM_DEPOSIT_TOKENS;
  const amountUsd = amountUsdFromInput(invest.amountInput);
  const baseBalance = balanceForFundingToken(
    balances.chainRows,
    invest.baseFundingToken,
  );
  const arbitrumBalance = balanceForFundingToken(
    balances.chainRows,
    activeArbitrumFundingToken,
  );
  const maxTotalUsd = useMemo(() => {
    if (invest.scope === 'base') {
      return spendableUsdForFundingToken(baseBalance, invest.baseFundingToken);
    }
    if (invest.scope === 'arbitrum') {
      return spendableUsdForFundingToken(
        arbitrumBalance,
        activeArbitrumFundingToken,
      );
    }
    return strategyMaxTotalUsd({
      base: { token: invest.baseFundingToken, balance: baseBalance },
      arbitrum: {
        token: activeArbitrumFundingToken,
        balance: arbitrumBalance,
      },
    });
  }, [
    activeArbitrumFundingToken,
    arbitrumBalance,
    baseBalance,
    invest.baseFundingToken,
    invest.scope,
  ]);
  const amountUsd6 = BigInt(invest.totalUsd6);
  const maxAmountInput =
    maxTotalUsd === null ? '' : maxUsdAmountInput(maxTotalUsd);
  const maxUsd6 = BigInt(amountInputToUsd6(maxAmountInput));
  const hasExactAmount = amountUsd6 > 0n;
  const minimumDepositUsd6 = minimumDepositUsd6ForScope(invest.scope);
  const belowMinimum = hasExactAmount && amountUsd6 < minimumDepositUsd6;
  const exceedsBalance =
    maxTotalUsd !== null && hasExactAmount && amountUsd6 > maxUsd6;
  const baseUnavailable =
    balances.isError || balances.failedChains.includes('base');
  const arbitrumUnavailable =
    balances.isError || balances.failedChains.includes('arbitrum');
  const requiredChainUnavailable = requiredChainUnavailableForScope(
    invest.scope,
    balances.failedChains,
    balances.isError,
  );
  const baseBalanceState = fundingBalanceState({
    isConnected: account.isConnected,
    isBoth,
    requiredChainUnavailable,
    chainUnavailable: baseUnavailable,
    isLoading: balances.isLoading,
  });
  const arbitrumBalanceState = fundingBalanceState({
    isConnected: account.isConnected,
    isBoth,
    requiredChainUnavailable,
    chainUnavailable: arbitrumUnavailable,
    isLoading: balances.isLoading,
  });
  const baseAllocationBps = isBoth ? 4_000 : 10_000;
  const arbitrumAllocationBps = isBoth ? 6_000 : 10_000;
  const baseTokenAmount = fundingTokenAmountFromUsd(
    amountUsd,
    baseAllocationBps,
    invest.baseFundingToken,
    baseBalance,
  );
  const arbitrumTokenAmount = fundingTokenAmountFromUsd(
    amountUsd,
    arbitrumAllocationBps,
    activeArbitrumFundingToken,
    arbitrumBalance,
  );
  const hasBaseBalance = BigInt(baseBalance?.balanceBaseUnits ?? '0') > 0n;
  const hasArbitrumBalance =
    BigInt(arbitrumBalance?.balanceBaseUnits ?? '0') > 0n;
  const activeHasBalance =
    invest.scope === 'base'
      ? hasBaseBalance
      : invest.scope === 'arbitrum'
        ? hasArbitrumBalance
        : hasBaseBalance && hasArbitrumBalance;
  const priceUnavailable =
    !requiredChainUnavailable &&
    !balances.isLoading &&
    maxTotalUsd === null &&
    activeHasBalance;
  const hasStrategyCapacity =
    maxTotalUsd === null ? activeHasBalance : maxUsd6 > 0n;
  const singleChainFundingDraft = useMemo(
    () =>
      buildSingleChainFundingDraft({
        scope: invest.scope,
        totalUsd6: invest.totalUsd6,
        baseFundingToken: invest.baseFundingToken,
        baseUsdPrice: baseBalance?.usdPrice ?? null,
        arbitrumFundingToken: activeArbitrumFundingToken,
        arbitrumUsdPrice: arbitrumBalance?.usdPrice ?? null,
      }),
    [
      activeArbitrumFundingToken,
      arbitrumBalance?.usdPrice,
      baseBalance?.usdPrice,
      invest.baseFundingToken,
      invest.scope,
      invest.totalUsd6,
    ],
  );
  const hasExecutableFundingAmount = isBoth || singleChainFundingDraft !== null;
  const canReview =
    account.isConnected &&
    !requiredChainUnavailable &&
    !balances.isLoading &&
    amountUsd6 >= minimumDepositUsd6 &&
    !exceedsBalance &&
    hasStrategyCapacity &&
    hasExecutableFundingAmount;
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

  const handlePrimaryAction = () => {
    if (!account.isConnected) {
      void account.connect();
      return;
    }
    if (requiredChainUnavailable) {
      void balances.refetch();
      return;
    }
    if (canReview) {
      invest.setSingleChainFundingDraft(
        isBoth ? null : singleChainFundingDraft,
      );
      router.push('/invest/route');
    }
  };

  const primaryLabel = !account.isConnected
    ? account.isConnecting
      ? CONNECTING_LABEL
      : CONNECT_WALLET_CTA
    : requiredChainUnavailable
      ? 'Retry balances'
      : balances.isLoading
        ? 'Loading balances…'
        : 'Review deposit';
  const notice = amountNotice({
    belowMinimum,
    exceedsBalance,
    requiredChainUnavailable,
    priceUnavailable,
    noSupportedBalance:
      account.isConnected && !balances.isLoading && maxTotalUsd === 0,
    isBoth,
    isBaseOnly,
    activeChainLabel,
  });

  function handleTabChange(tab: InvestAmountTab): void {
    setSingleChainTokenSelector(null);
    setActiveTab(tab);
    if (tab !== 'bridge') {
      invest.setScope(tab);
    }
  }

  if (activeTab === 'bridge') {
    return (
      <ScreenScrollView>
        <StepHeader title="Invest" step="Bridge test" />
        <View className="px-5 pt-5">
          <Text className="font-serif text-[28px] leading-[32px] text-ink">
            Bridge USDC
          </Text>
          <Text className="mt-2 text-[12.5px] leading-[19px] text-ink-dim">
            Test canonical USDC transfers through LI.FI without entering a
            strategy.
          </Text>
          <InvestScopeToggle value={activeTab} onChange={handleTabChange} />
          <BridgeTestPanel />
        </View>
      </ScreenScrollView>
    );
  }

  return (
    <>
      <ScreenScrollView>
        <StepHeader title="Invest" step="Step 1 of 2" />
        <StepProgress current={1} />
        <View className="px-5 pt-5">
          <Text className="font-serif text-[28px] leading-[32px] text-ink">
            Deposit into strategy
          </Text>
          <Text className="mt-2 text-[12.5px] leading-[19px] text-ink-dim">
            {isBoth
              ? 'Choose one funding token on each destination chain.'
              : isBaseOnly
                ? 'Test one Base funding token with Morpho Moonwell.'
                : 'Choose an Arbitrum funding token for GMX BTC/USDC.'}
          </Text>

          <InvestScopeToggle value={activeTab} onChange={handleTabChange} />

          <View className="mt-4 rounded-[22px] border border-line bg-[#111113] p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-[11px] text-ink-dim">You deposit</Text>
              <Text className="font-mono text-[10.5px] text-ink-dim">
                {availableLabel}
              </Text>
            </View>
            <View className="mt-2 flex-row items-center">
              <Text className="mr-2 font-sans-semibold text-[30px] text-ink-faint">
                $
              </Text>
              <TextInput
                accessibilityLabel="Total deposit in US dollars"
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
              {isBoth ? (
                <View className="rounded-full bg-[#242427] px-3 py-2">
                  <Text className="font-sans-semibold text-[12px] text-ink-dim">
                    USD
                  </Text>
                </View>
              ) : (
                <TokenSelectorPill
                  symbol={activeFundingToken.symbol}
                  glyph={activeFundingToken.glyph}
                  iconBg={activeFundingToken.iconBg}
                  accessibilityLabel={`Select ${activeChainLabel} funding token`}
                  onPress={() =>
                    setSingleChainTokenSelector(
                      isBaseOnly ? 'base' : 'arbitrum',
                    )
                  }
                />
              )}
            </View>
            <QuickAmountChips
              disabled={quickAmountsDisabled}
              maxAccessibilityLabel={
                isBoth
                  ? 'Use maximum strategy deposit supported by both chains'
                  : `Use maximum deposit supported on ${activeChainLabel}`
              }
              onSelect={(bps) =>
                invest.setAmountInput(quickAmountUsdInput(maxTotalUsd, bps))
              }
            />
          </View>

          <SwapArrowDivider />

          <View className="gap-2">
            {invest.scope !== 'arbitrum' ? (
              isBoth ? (
                <FundingSourceSelector
                  chainLabel="Base"
                  allocation="40%"
                  protocol="Morpho · Moonwell USDC"
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
              ) : (
                <FundingSourceCard
                  chainLabel="Base"
                  allocation="100%"
                  protocol="Morpho · Moonwell USDC"
                  token={invest.baseFundingToken}
                  tokenAmount={baseTokenAmount}
                  hasAmount={amountUsd !== null}
                  allocatedUsd={amountUsd ?? 0}
                  balance={baseBalance}
                  balanceState={baseBalanceState}
                  onSelectToken={undefined}
                />
              )
            ) : null}
            {invest.scope !== 'base' ? (
              isBoth ? (
                <FundingSourceSelector
                  chainLabel="Arbitrum"
                  allocation="60%"
                  protocol="GMX · BTC/USDC + ETH/USDC"
                  tokens={ARBITRUM_DEPOSIT_TOKENS}
                  token={activeArbitrumFundingToken}
                  tokenAmount={arbitrumTokenAmount}
                  hasAmount={amountUsd !== null}
                  allocatedUsd={(amountUsd ?? 0) * 0.6}
                  balance={arbitrumBalance}
                  balanceState={arbitrumBalanceState}
                  rows={balances.chainRows}
                  onSelectToken={invest.setArbitrumFundingToken}
                />
              ) : (
                <FundingSourceCard
                  chainLabel="Arbitrum"
                  allocation="100%"
                  protocol="GMX · BTC/BTC + ETH/ETH + BTC/USDC + ETH/USDC"
                  token={activeArbitrumFundingToken}
                  tokenAmount={arbitrumTokenAmount}
                  hasAmount={amountUsd !== null}
                  allocatedUsd={amountUsd ?? 0}
                  balance={arbitrumBalance}
                  balanceState={arbitrumBalanceState}
                  onSelectToken={undefined}
                />
              )
            ) : null}
          </View>

          {notice === null ? null : (
            <Text className={notice.className}>{notice.message}</Text>
          )}

          {isBoth ? (
            <View className="mt-3 flex-row items-start gap-2 rounded-xl bg-[rgba(212,197,163,.055)] px-3 py-2.5">
              <Info size={14} color="#9a8f78" style={{ marginTop: 1 }} />
              <Text className="flex-1 text-[10.5px] leading-[15px] text-[#9a8f78]">
                Mock bridge: Arbitrum deposits use funds already in this wallet.
              </Text>
            </View>
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
          <Tap
            accessibilityRole="link"
            className="min-h-11 items-center justify-center"
            onPress={() => router.push('/invest/hyperliquid')}
          >
            <Text className="text-[11px] text-ink-dim underline">
              Open the existing Base → Hyperliquid flow
            </Text>
          </Tap>
        </View>
      </ScreenScrollView>

      <ChainTokenSelectorSheet
        visible={!isBoth && singleChainTokenSelector !== null}
        chainLabel={activeChainLabel}
        tokens={activeFundingTokens}
        rows={balances.chainRows}
        balanceState={isBaseOnly ? baseBalanceState : arbitrumBalanceState}
        selected={activeFundingToken}
        onSelect={
          isBaseOnly
            ? invest.setBaseFundingToken
            : invest.setArbitrumFundingToken
        }
        onClose={() => setSingleChainTokenSelector(null)}
      />
    </>
  );
}
