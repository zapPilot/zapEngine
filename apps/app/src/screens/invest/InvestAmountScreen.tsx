import { useRouter } from 'expo-router';
import { ChevronDown, Info } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import {
  CONNECT_WALLET_CTA,
  CONNECTING_LABEL,
} from '@/components/connect/connectCopy';
import { ChainTokenSelectorSheet } from '@/components/invest/ChainTokenSelectorSheet';
import { StepHeader } from '@/components/invest/StepHeader';
import { StepProgress } from '@/components/invest/StepProgress';
import { TokenIcon } from '@/components/token/TokenIcon';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { Tap } from '@/components/ui/Tap';
import {
  ARBITRUM_DEPOSIT_TOKENS,
  BASE_DEPOSIT_TOKENS,
  DEFAULT_ARBITRUM_FUNDING_TOKEN,
  type DesktopDepositToken,
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
  requiredChainUnavailableForScope,
  spendableUsdForFundingToken,
  strategyMaxTotalUsd,
} from '@/integration/investAmountModel';
import { useAccount } from '@/integration/useAccount';
import { type InvestScope, useInvest } from '@/integration/useInvest';
import type { ChainTokenBalanceRow } from '@/integration/walletTokens';
import { useWalletAssets } from '@/integration/walletTokens';
import { formatTokenBalance, formatUsd } from '@/lib/format';

type FundingBalanceState = 'loading' | 'unavailable' | 'loaded';

interface FundingSourceInputProps {
  chainLabel: string;
  allocation: string;
  protocol: string;
  token: DesktopDepositToken;
  tokenAmount: number | null;
  hasAmount: boolean;
  allocatedUsd: number;
  balance: ChainTokenBalanceRow | null;
  balanceState: FundingBalanceState;
  onSelect: (() => void) | undefined;
}

function formattedTokenAmount(
  value: number | null,
  token: DesktopDepositToken,
  hasAmount: boolean,
): string {
  if (!hasAmount) return '0';
  if (value === null) return '—';
  return value.toLocaleString('en-US', {
    maximumFractionDigits: token.symbol === 'ETH' ? 6 : 2,
  });
}

function FundingSourceInput({
  chainLabel,
  allocation,
  protocol,
  token,
  tokenAmount,
  hasAmount,
  allocatedUsd,
  balance,
  balanceState,
  onSelect,
}: FundingSourceInputProps) {
  const tokenPill = (
    <>
      <TokenIcon glyph={token.glyph} bg={token.iconBg} size={28} alt="" />
      <Text className="font-sans-semibold text-[13px] text-ink">
        {token.symbol}
      </Text>
    </>
  );

  return (
    <View className="rounded-[18px] border border-line bg-[#171719] px-4 py-3.5">
      <View className="flex-row items-start justify-between">
        <View>
          <View className="flex-row items-center gap-2">
            <Text className="font-sans-semibold text-[12px] text-ink">
              {chainLabel}
            </Text>
            <View className="rounded-full bg-[rgba(212,197,163,.1)] px-2 py-0.5">
              <Text className="font-mono text-[8.5px] text-accent">
                {allocation}
              </Text>
            </View>
          </View>
          <Text className="mt-1 text-[11px] text-ink-dim">{protocol}</Text>
        </View>
        <Text className="font-mono text-[10px] text-ink-dim">
          Balance{' '}
          {formatTokenBalance(balance?.balance, token.symbol, balanceState)}
        </Text>
      </View>

      <View className="mt-4 flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text
            className="font-sans-semibold text-[28px] leading-[32px] text-ink"
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formattedTokenAmount(tokenAmount, token, hasAmount)}
          </Text>
          <Text className="mt-1 font-mono text-[10px] text-ink-dim">
            Target allocation {formatUsd(allocatedUsd)}
          </Text>
        </View>
        {onSelect ? (
          <Tap
            accessibilityRole="button"
            accessibilityLabel={`Select ${chainLabel} funding token`}
            className="flex-row items-center gap-2 rounded-full border border-line bg-[#242427] py-2 pl-2 pr-3"
            onPress={onSelect}
          >
            {tokenPill}
            <ChevronDown size={15} color="#a1a1aa" />
          </Tap>
        ) : (
          <View
            accessibilityLabel={`${chainLabel} funding token ${token.symbol}`}
            className="flex-row items-center gap-2 rounded-full border border-line bg-[#242427] py-2 pl-2 pr-3"
          >
            {tokenPill}
          </View>
        )}
      </View>
    </View>
  );
}

const INVEST_SCOPE_OPTIONS: readonly {
  value: InvestScope;
  label: string;
}[] = [
  { value: 'both', label: 'Both chains' },
  { value: 'base', label: 'Base only' },
  { value: 'arbitrum', label: 'Arbitrum only' },
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
  style?: { color: string };
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
      className: 'mt-2.5 px-1 text-[11px] text-danger',
      message: isBaseOnly
        ? 'Enter at least $0.01 to test the Base Morpho deposit.'
        : isBoth
          ? 'Enter at least $10 to deposit into the strategy.'
          : 'Enter at least $10 — GMX keeper fees make smaller deposits uneconomical.',
    };
  }
  if (exceedsBalance) {
    return {
      className: 'mt-2.5 px-1 text-[11px] text-danger',
      message: isBoth
        ? 'This amount exceeds the available balance on at least one chain.'
        : `This amount exceeds the available ${activeChainLabel} balance.`,
    };
  }
  if (requiredChainUnavailable) {
    return {
      className: 'mt-2.5 px-1 text-[11px]',
      style: { color: '#ef7474' },
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
  value: InvestScope;
  onChange: (scope: InvestScope) => void;
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
  const [selector, setSelector] = useState<'base' | 'arbitrum' | null>(null);
  const isBoth = invest.scope === 'both';
  const isBaseOnly = invest.scope === 'base';
  const activeChainLabel = isBaseOnly ? 'Base' : 'Arbitrum';
  const activeArbitrumFundingToken =
    invest.scope === 'arbitrum'
      ? DEFAULT_ARBITRUM_FUNDING_TOKEN
      : invest.arbitrumFundingToken;
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
      }),
    [
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

  return (
    <>
      <ScreenScrollView>
        <StepHeader title="Invest" step="Step 1 of 3" />
        <StepProgress current={1} />
        <View className="px-5 pt-5">
          <Text className="font-sans-semibold text-[22px] text-ink">
            Deposit into strategy
          </Text>
          <Text className="mt-1.5 text-[12px] leading-[18px] text-ink-dim">
            {isBoth
              ? 'Choose one funding token on each destination chain.'
              : isBaseOnly
                ? 'Test one Base funding token with Morpho Moonwell.'
                : 'Test canonical Arbitrum USDC with GMX BTC/USDC.'}
          </Text>

          <InvestScopeToggle
            value={invest.scope}
            onChange={(scope) => {
              setSelector(null);
              invest.setScope(scope);
            }}
          />

          <View className="mt-4 rounded-[22px] border border-line bg-[#111113] p-3">
            <View className="px-1 pb-3 pt-1">
              <View className="flex-row items-center justify-between">
                <Text className="text-[11px] text-ink-dim">You deposit</Text>
                <Tap
                  accessibilityRole="button"
                  accessibilityLabel={
                    isBoth
                      ? 'Use maximum strategy deposit supported by both chains'
                      : `Use maximum deposit supported on ${activeChainLabel}`
                  }
                  accessibilityState={{
                    disabled:
                      !account.isConnected ||
                      maxTotalUsd === null ||
                      maxUsd6 <= 0n ||
                      balances.isLoading ||
                      requiredChainUnavailable,
                  }}
                  className="min-h-11 justify-center"
                  disabled={
                    !account.isConnected ||
                    maxTotalUsd === null ||
                    maxUsd6 <= 0n ||
                    balances.isLoading ||
                    requiredChainUnavailable
                  }
                  hitSlop={8}
                  onPress={() => invest.setAmountInput(maxAmountInput)}
                >
                  <Text
                    className="font-mono text-[10.5px] text-ink-dim"
                    style={
                      maxUsd6 <= 0n ||
                      maxTotalUsd === null ||
                      balances.isLoading ||
                      requiredChainUnavailable
                        ? { opacity: 0.5 }
                        : undefined
                    }
                  >
                    {balances.isLoading
                      ? 'Loading balances…'
                      : requiredChainUnavailable || !account.isConnected
                        ? 'Available —'
                        : maxTotalUsd === null
                          ? 'Available — · USD price unavailable'
                          : `Available ${formatUsd(maxTotalUsd)} · `}
                    {!balances.isLoading &&
                    !requiredChainUnavailable &&
                    account.isConnected &&
                    maxTotalUsd !== null ? (
                      <Text className="text-accent">
                        {isBoth ? 'STRATEGY MAX' : 'CHAIN MAX'}
                      </Text>
                    ) : null}
                  </Text>
                </Tap>
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
                <View className="rounded-full bg-[#242427] px-3 py-2">
                  <Text className="font-sans-semibold text-[12px] text-ink-dim">
                    USD
                  </Text>
                </View>
              </View>
            </View>

            {isBoth ? (
              <View className="my-1 flex-row items-center gap-2 px-1">
                <View className="h-px flex-1 bg-line" />
                <Text className="font-mono text-[8.5px] uppercase tracking-[.7px] text-ink-faint">
                  40 / 60 split
                </Text>
                <View className="h-px flex-1 bg-line" />
              </View>
            ) : null}

            <View className="mt-1 gap-2">
              {invest.scope !== 'arbitrum' ? (
                <FundingSourceInput
                  chainLabel="Base"
                  allocation={isBoth ? '40%' : '100%'}
                  protocol="Morpho · Moonwell USDC"
                  token={invest.baseFundingToken}
                  tokenAmount={baseTokenAmount}
                  hasAmount={amountUsd !== null}
                  allocatedUsd={(amountUsd ?? 0) * (isBoth ? 0.4 : 1)}
                  balance={baseBalance}
                  balanceState={baseBalanceState}
                  onSelect={() => setSelector('base')}
                />
              ) : null}
              {invest.scope !== 'base' ? (
                <FundingSourceInput
                  chainLabel="Arbitrum"
                  allocation={isBoth ? '60%' : '100%'}
                  protocol={
                    isBoth ? 'GMX · BTC/USDC + ETH/USDC' : 'GMX · BTC/USDC'
                  }
                  token={activeArbitrumFundingToken}
                  tokenAmount={arbitrumTokenAmount}
                  hasAmount={amountUsd !== null}
                  allocatedUsd={(amountUsd ?? 0) * (isBoth ? 0.6 : 1)}
                  balance={arbitrumBalance}
                  balanceState={arbitrumBalanceState}
                  onSelect={isBoth ? () => setSelector('arbitrum') : undefined}
                />
              ) : null}
            </View>
          </View>

          {notice === null ? null : (
            <Text className={notice.className} style={notice.style}>
              {notice.message}
            </Text>
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
        visible={selector === 'base'}
        chainLabel="Base"
        tokens={BASE_DEPOSIT_TOKENS}
        rows={balances.chainRows}
        balanceState={baseBalanceState}
        selected={invest.baseFundingToken}
        onSelect={invest.setBaseFundingToken}
        onClose={() => setSelector(null)}
      />
      <ChainTokenSelectorSheet
        visible={isBoth && selector === 'arbitrum'}
        chainLabel="Arbitrum"
        tokens={ARBITRUM_DEPOSIT_TOKENS}
        rows={balances.chainRows}
        balanceState={arbitrumBalanceState}
        selected={invest.arbitrumFundingToken}
        onSelect={invest.setArbitrumFundingToken}
        onClose={() => setSelector(null)}
      />
    </>
  );
}
