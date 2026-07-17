import { useRouter } from 'expo-router';
import { ChevronDown, Info } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

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
  type DesktopDepositToken,
} from '@/integration/depositTokens';
import {
  amountInputToUsd6,
  amountUsdFromInput,
  balanceForFundingToken,
  fundingTokenAmountFromUsd,
  maxUsdAmountInput,
  MIN_STRATEGY_DEPOSIT_USD6,
  normalizeAmountInput,
  strategyMaxTotalUsd,
} from '@/integration/investAmountModel';
import { useAccount } from '@/integration/useAccount';
import { useInvest } from '@/integration/useInvest';
import type { ChainTokenBalanceRow } from '@/integration/walletTokens';
import { useWalletAssets } from '@/integration/walletTokens';
import { formatUsd } from '@/lib/format';

interface FundingSourceInputProps {
  chainLabel: string;
  allocation: string;
  protocol: string;
  token: DesktopDepositToken;
  tokenAmount: number | null;
  hasAmount: boolean;
  allocatedUsd: number;
  balance: ChainTokenBalanceRow | null;
  balanceState: 'loading' | 'unavailable' | 'loaded';
  onSelect: () => void;
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

function formattedBalance(
  token: DesktopDepositToken,
  balance: ChainTokenBalanceRow | null,
  state: FundingSourceInputProps['balanceState'],
): string {
  if (state === 'loading') return 'Loading…';
  if (state === 'unavailable') return 'Unavailable';
  const value = Number.parseFloat(balance?.balance ?? '0');
  return `${(Number.isFinite(value) ? value : 0).toLocaleString('en-US', {
    maximumFractionDigits: token.symbol === 'ETH' ? 6 : 2,
  })} ${token.symbol}`;
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
          Balance {formattedBalance(token, balance, balanceState)}
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
        <Tap
          accessibilityRole="button"
          accessibilityLabel={`Select ${chainLabel} funding token`}
          className="flex-row items-center gap-2 rounded-full border border-line bg-[#242427] py-2 pl-2 pr-3"
          onPress={onSelect}
        >
          <TokenIcon glyph={token.glyph} bg={token.iconBg} size={28} alt="" />
          <Text className="font-sans-semibold text-[13px] text-ink">
            {token.symbol}
          </Text>
          <ChevronDown size={15} color="#a1a1aa" />
        </Tap>
      </View>
    </View>
  );
}

export function InvestAmountScreen() {
  const router = useRouter();
  const account = useAccount();
  const invest = useInvest();
  const balances = useWalletAssets(account.address);
  const [selector, setSelector] = useState<'base' | 'arbitrum' | null>(null);
  const amountUsd = amountUsdFromInput(invest.amountInput, 'USD', 1);
  const baseBalance = balanceForFundingToken(
    balances.chainRows,
    invest.baseFundingToken,
  );
  const arbitrumBalance = balanceForFundingToken(
    balances.chainRows,
    invest.arbitrumFundingToken,
  );
  const maxTotalUsd = useMemo(
    () =>
      strategyMaxTotalUsd({
        base: { token: invest.baseFundingToken, balance: baseBalance },
        arbitrum: {
          token: invest.arbitrumFundingToken,
          balance: arbitrumBalance,
        },
      }),
    [
      arbitrumBalance,
      baseBalance,
      invest.arbitrumFundingToken,
      invest.baseFundingToken,
    ],
  );
  const amountUsd6 = BigInt(invest.totalUsd6);
  const maxAmountInput =
    maxTotalUsd === null ? '' : maxUsdAmountInput(maxTotalUsd);
  const maxUsd6 = BigInt(amountInputToUsd6(maxAmountInput));
  const hasExactAmount = amountUsd6 > 0n;
  const belowMinimum = hasExactAmount && amountUsd6 < MIN_STRATEGY_DEPOSIT_USD6;
  const exceedsBalance =
    maxTotalUsd !== null && hasExactAmount && amountUsd6 > maxUsd6;
  const requiredChainUnavailable =
    balances.isError ||
    balances.failedChains.includes('base') ||
    balances.failedChains.includes('arbitrum');
  const balanceState: FundingSourceInputProps['balanceState'] =
    !account.isConnected || requiredChainUnavailable
      ? 'unavailable'
      : balances.isLoading
        ? 'loading'
        : 'loaded';
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
  const hasBaseBalance = BigInt(baseBalance?.balanceBaseUnits ?? '0') > 0n;
  const hasArbitrumBalance =
    BigInt(arbitrumBalance?.balanceBaseUnits ?? '0') > 0n;
  const priceUnavailable =
    !requiredChainUnavailable &&
    !balances.isLoading &&
    maxTotalUsd === null &&
    hasBaseBalance &&
    hasArbitrumBalance;
  const hasStrategyCapacity =
    maxTotalUsd === null ? hasBaseBalance && hasArbitrumBalance : maxUsd6 > 0n;
  const canReview =
    account.isConnected &&
    !requiredChainUnavailable &&
    !balances.isLoading &&
    amountUsd6 >= MIN_STRATEGY_DEPOSIT_USD6 &&
    !exceedsBalance &&
    hasStrategyCapacity;

  const handlePrimaryAction = () => {
    if (!account.isConnected) {
      void account.connect();
      return;
    }
    if (requiredChainUnavailable) {
      void balances.refetch();
      return;
    }
    if (canReview) router.push('/invest/route');
  };

  const primaryLabel = !account.isConnected
    ? account.isConnecting
      ? 'Connecting…'
      : 'Connect wallet'
    : requiredChainUnavailable
      ? 'Retry balances'
      : balances.isLoading
        ? 'Loading balances…'
        : 'Review deposit';

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
            Choose one funding token on each destination chain.
          </Text>

          <View className="mt-4 rounded-[22px] border border-line bg-[#111113] p-3">
            <View className="px-1 pb-3 pt-1">
              <View className="flex-row items-center justify-between">
                <Text className="text-[11px] text-ink-dim">You deposit</Text>
                <Tap
                  accessibilityRole="button"
                  accessibilityLabel="Use maximum strategy deposit supported by both chains"
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
                      <Text className="text-accent">STRATEGY MAX</Text>
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

            <View className="my-1 flex-row items-center gap-2 px-1">
              <View className="h-px flex-1 bg-line" />
              <Text className="font-mono text-[8.5px] uppercase tracking-[.7px] text-ink-faint">
                40 / 60 split
              </Text>
              <View className="h-px flex-1 bg-line" />
            </View>

            <View className="mt-1 gap-2">
              <FundingSourceInput
                chainLabel="Base"
                allocation="40%"
                protocol="Morpho · Moonwell USDC"
                token={invest.baseFundingToken}
                tokenAmount={baseTokenAmount}
                hasAmount={amountUsd !== null}
                allocatedUsd={(amountUsd ?? 0) * 0.4}
                balance={baseBalance}
                balanceState={balanceState}
                onSelect={() => setSelector('base')}
              />
              <FundingSourceInput
                chainLabel="Arbitrum"
                allocation="60%"
                protocol="GMX · BTC/USDC + ETH/USDC"
                token={invest.arbitrumFundingToken}
                tokenAmount={arbitrumTokenAmount}
                hasAmount={amountUsd !== null}
                allocatedUsd={(amountUsd ?? 0) * 0.6}
                balance={arbitrumBalance}
                balanceState={balanceState}
                onSelect={() => setSelector('arbitrum')}
              />
            </View>
          </View>

          {belowMinimum ? (
            <Text className="mt-2.5 px-1 text-[11px] text-danger">
              Enter at least $10 — GMX keeper fees make smaller deposits
              uneconomical.
            </Text>
          ) : exceedsBalance ? (
            <Text className="mt-2.5 px-1 text-[11px] text-danger">
              This amount exceeds the available balance on at least one chain.
            </Text>
          ) : requiredChainUnavailable ? (
            <Text
              className="mt-2.5 px-1 text-[11px]"
              style={{ color: '#ef7474' }}
            >
              Base or Arbitrum balances are unavailable. Retry to continue.
            </Text>
          ) : priceUnavailable ? (
            <Text className="mt-2.5 px-1 text-[11px] leading-[16px] text-ink-dim">
              Live ETH pricing is unavailable, so Max is disabled. The server
              quote and final preflight will validate the exact token amount.
            </Text>
          ) : account.isConnected &&
            !balances.isLoading &&
            maxTotalUsd === 0 ? (
            <Text className="mt-2.5 px-1 text-[11px] text-ink-dim">
              No supported balance is available on both Base and Arbitrum.
            </Text>
          ) : null}

          <View className="mt-3 flex-row items-start gap-2 rounded-xl bg-[rgba(212,197,163,.055)] px-3 py-2.5">
            <Info size={14} color="#9a8f78" style={{ marginTop: 1 }} />
            <Text className="flex-1 text-[10.5px] leading-[15px] text-[#9a8f78]">
              Mock bridge: Arbitrum deposits use funds already in this wallet.
            </Text>
          </View>

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
        balanceState={balanceState}
        selected={invest.baseFundingToken}
        onSelect={invest.setBaseFundingToken}
        onClose={() => setSelector(null)}
      />
      <ChainTokenSelectorSheet
        visible={selector === 'arbitrum'}
        chainLabel="Arbitrum"
        tokens={ARBITRUM_DEPOSIT_TOKENS}
        rows={balances.chainRows}
        balanceState={balanceState}
        selected={invest.arbitrumFundingToken}
        onSelect={invest.setArbitrumFundingToken}
        onClose={() => setSelector(null)}
      />
    </>
  );
}
