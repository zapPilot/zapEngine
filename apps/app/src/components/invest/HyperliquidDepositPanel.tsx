import { useWalletProvider } from '@zapengine/app-core/providers/walletContext';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { CONNECT_WALLET_CTA } from '@/components/connect/connectCopy';
import { ChainTokenSelectorSheet } from '@/components/invest/ChainTokenSelectorSheet';
import { QuickAmountChips } from '@/components/invest/QuickAmountChips';
import { TokenSelectorPill } from '@/components/invest/TokenSelectorPill';
import { Card } from '@/components/ui/Card';
import { InfoRow } from '@/components/ui/InfoRow';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { HLP_DEPOSIT_TOKENS } from '@/integration/depositTokens';
import {
  amountInputToUsd6,
  amountUsdFromInput,
  balanceForFundingToken,
  maxUsdAmountInput,
  normalizeAmountInput,
  quickAmountUsdInput,
  spendableUsdForFundingToken,
} from '@/integration/investAmountModel';
import { resolveDepositExecutionCapability } from '@/integration/investExecutionModel';
import {
  belowHlpMinimum,
  hlpBalanceLabel,
  HYPERLIQUID_HLP_SPLIT,
} from '@/integration/hyperliquidPanelModel';
import { formatPlanGas } from '@/integration/planPreviewFormatters';
import { useAccount } from '@/integration/useAccount';
import {
  useHlpPerpBalance,
  useHlpSpotBalance,
} from '@/integration/useHlpBalances';
import { useDepositPlanPreview } from '@/integration/useDepositPlanPreview';
import { useInvest } from '@/integration/useInvest';
import { useInvestExecution } from '@/integration/useInvestExecution';
import { useWalletAssets } from '@/integration/walletTokens';
import { formatTokenBalance, formatUsd } from '@/lib/format';

const BASE_CHAIN_ID = 8453;
const HLP_FUNDING_TOKEN = HLP_DEPOSIT_TOKENS[0];

/**
 * Step 1 for the unified HLP flow. This component only freezes the exact Base
 * USDC funding draft and routes into `/invest/route`; execution lives in the
 * same reviewed flow as the other invest destinations. Balances are shown on
 * both sides: Base wallet USDC funds the input, HyperCore perp USDC shows
 * what already arrived on the Hyperliquid chain.
 */
export function HyperliquidDepositPanel() {
  const router = useRouter();
  const account = useAccount();
  const invest = useInvest();
  const { reset: resetReviewedExecution } = useInvestExecution();
  const wallet = useWalletProvider();
  const [amountInput, setAmountInput] = useState(
    invest.destination === 'hlp' ? invest.amountInput : '',
  );
  const [tokenSelectorOpen, setTokenSelectorOpen] = useState(false);
  const amountUsd = amountUsdFromInput(amountInput);
  const fromAmount = amountInputToUsd6(amountInput);
  const balances = useWalletAssets(account.address);
  const hlpBalance = balanceForFundingToken(
    balances.chainRows,
    HLP_FUNDING_TOKEN,
  );
  const maxTotalUsd = spendableUsdForFundingToken(
    hlpBalance,
    HLP_FUNDING_TOKEN,
  );
  const baseUnavailable =
    balances.isError || balances.failedChains.includes('base');
  const balanceState: 'loading' | 'unavailable' | 'loaded' =
    !account.isConnected || baseUnavailable
      ? 'unavailable'
      : balances.isLoading
        ? 'loading'
        : 'loaded';
  const availableLabel = balances.isLoading
    ? 'Loading balances…'
    : baseUnavailable || !account.isConnected
      ? 'Available —'
      : maxTotalUsd === null
        ? 'Available — · USD price unavailable'
        : `Available ${formatUsd(maxTotalUsd)}`;
  const balanceLine = formatTokenBalance(
    hlpBalance?.balance,
    HLP_FUNDING_TOKEN.symbol,
    balanceState,
  );
  const hlpPerp = useHlpPerpBalance(account.address);
  const hlpSpot = useHlpSpotBalance(account.address);
  const labelFor = (
    pot: { isLoading: boolean; isError: boolean },
    value: bigint | undefined,
  ): string =>
    hlpBalanceLabel({
      isConnected: account.isConnected,
      isLoading: pot.isLoading,
      isError: pot.isError,
      value,
    });
  const spotTotalLabel = labelFor(hlpSpot, hlpSpot.balance?.totalUsd6);
  const perpWithdrawableLabel = labelFor(
    hlpPerp,
    hlpPerp.balance?.withdrawableUsd6,
  );
  const perpAccountValueLabel = labelFor(
    hlpPerp,
    hlpPerp.balance?.accountValueUsd6,
  );
  const preview = useDepositPlanPreview({
    address: account.address,
    fromToken: HLP_FUNDING_TOKEN.depositAddress,
    fromAmount,
    sourceChainId: BASE_CHAIN_ID,
    amountUsd: amountUsd ?? 0,
    split: HYPERLIQUID_HLP_SPLIT,
  });
  const capability = resolveDepositExecutionCapability({
    isConnected: wallet.isConnected,
    executionMode: wallet.executionMode,
  });
  const belowMinimum = belowHlpMinimum(fromAmount);
  const hasAmount = amountUsd !== null && fromAmount !== '0';
  const maxAmountInput =
    maxTotalUsd === null ? '' : maxUsdAmountInput(maxTotalUsd);
  const exceedsBalance =
    maxTotalUsd !== null &&
    hasAmount &&
    BigInt(fromAmount) > BigInt(amountInputToUsd6(maxAmountInput));
  const quickAmountsDisabled =
    !account.isConnected ||
    maxTotalUsd === null ||
    BigInt(amountInputToUsd6(maxAmountInput)) <= 0n ||
    balances.isLoading ||
    baseUnavailable;

  const handleQuickAmount = (bps: number) => {
    setAmountInput(quickAmountUsdInput(maxTotalUsd, bps));
  };

  const reviewDeposit = () => {
    if (capability === 'connect-wallet') {
      void account.connect();
      return;
    }
    if (capability !== 'ready' || !hasAmount || belowMinimum || exceedsBalance)
      return;

    // A previous reviewed Base/Arbitrum execution is not valid evidence for
    // this HLP destination, even if amount/token happen to match exactly.
    resetReviewedExecution();

    // Set all draft dimensions first; each setter intentionally clears stale
    // frozen execution state. Freeze the exact USDC amount last.
    invest.setScope('base');
    invest.setDestination('hlp');
    invest.setBaseFundingToken(HLP_FUNDING_TOKEN);
    invest.setAmountInput(amountInput);
    invest.setSingleChainFundingDraft({
      scope: 'base',
      chainId: BASE_CHAIN_ID,
      fromToken: HLP_FUNDING_TOKEN.depositAddress,
      fromAmount,
    });
    router.push('/invest/route');
  };

  return (
    <>
      <View className="mt-4">
        <Card className="p-4">
          <View className="flex-row items-center justify-between">
            <Text className="font-mono text-[10px] uppercase tracking-[1px] text-ink-dim">
              Base USDC amount
            </Text>
            <Text className="font-mono text-[10.5px] text-ink-dim">
              {availableLabel}
            </Text>
          </View>
          <View className="mt-2 flex-row items-center">
            <Text className="mr-2 font-sans-semibold text-[28px] text-ink-dim">
              $
            </Text>
            <TextInput
              accessibilityLabel="Hyperliquid deposit amount in US dollars"
              className="min-w-0 flex-1 font-sans-semibold text-[40px] leading-[46px] text-ink"
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor="#52525b"
              value={amountInput}
              onChangeText={(value) =>
                setAmountInput(normalizeAmountInput(value))
              }
            />
            <TokenSelectorPill
              symbol={HLP_FUNDING_TOKEN.symbol}
              chainKey={HLP_FUNDING_TOKEN.chainKey}
              accessibilityLabel="Select Hyperliquid funding token"
              onPress={() => setTokenSelectorOpen(true)}
            />
          </View>
          <Text className="mt-1 font-mono text-[11px] text-ink-dim">
            Balance: {balanceLine}
          </Text>
          <QuickAmountChips
            disabled={quickAmountsDisabled}
            maxAccessibilityLabel="Use maximum HLP deposit supported on Base"
            onSelect={handleQuickAmount}
          />
        </Card>

        <Card className="mt-3 p-4">
          <Text className="font-mono text-[10px] uppercase tracking-[1px] text-ink-dim">
            On Hyperliquid
          </Text>
          <View className="mt-2">
            <InfoRow label="Spot USDC" value={spotTotalLabel} divider />
            <InfoRow
              label="Perp USDC withdrawable"
              value={perpWithdrawableLabel}
              divider
            />
            <InfoRow label="Perp account value" value={perpAccountValueLabel} />
          </View>
        </Card>

        <Card className="mt-3 p-4">
          <InfoRow label="Bridge source" value={balanceLine} divider />
          <InfoRow label="Destination" value="Official HLP vault" divider />
          <InfoRow label="Minimum received" value="10 USDC" divider />
          <InfoRow
            label="Estimated gas"
            value={
              preview.isLoading
                ? 'Loading…'
                : formatPlanGas(preview.plan?.totalGasUsd)
            }
          />
        </Card>

        {belowMinimum ? (
          <Text className="mt-2.5 px-1 text-[11px] text-error">
            Enter at least $10. The quoted HyperCore output must also remain at
            least 10 USDC after bridge fees and slippage.
          </Text>
        ) : null}
        {exceedsBalance ? (
          <Text className="mt-2.5 px-1 text-[11px] text-error">
            This amount exceeds the available Base balance.
          </Text>
        ) : null}
        {preview.isError ? (
          <Text className="mt-2.5 px-1 text-[11px] leading-4 text-error">
            The HLP route is unavailable for this amount. Increase the amount or
            retry the quote.
          </Text>
        ) : null}

        <PrimaryButton
          className="mt-5"
          disabled={
            preview.isLoading ||
            preview.isError ||
            !hasAmount ||
            belowMinimum ||
            exceedsBalance ||
            capability === 'unsupported-wallet'
          }
          onPress={reviewDeposit}
        >
          {capability === 'connect-wallet'
            ? CONNECT_WALLET_CTA
            : capability === 'unsupported-wallet'
              ? 'Use a supported web wallet'
              : preview.isLoading
                ? 'Preparing route…'
                : 'Review HLP deposit'}
        </PrimaryButton>
        <Text className="mt-3 text-[10.5px] leading-[16px] text-ink-faint">
          The Base bridge batch is reviewed before signing. After funds reach
          Hyperliquid, your wallet signs the gasless HLP vault action.
        </Text>
      </View>

      <ChainTokenSelectorSheet
        visible={tokenSelectorOpen}
        chainKey={HLP_FUNDING_TOKEN.chainKey}
        tokens={HLP_DEPOSIT_TOKENS}
        rows={balances.chainRows}
        balanceState={balanceState}
        selected={HLP_FUNDING_TOKEN}
        onSelect={() => setTokenSelectorOpen(false)}
        onClose={() => setTokenSelectorOpen(false)}
      />
    </>
  );
}
