import { useWalletProvider } from '@zapengine/app-core/providers/walletContext';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { formatUnits } from 'viem';

import { CONNECT_WALLET_CTA } from '@/components/connect/connectCopy';
import { QuickAmountChips } from '@/components/invest/QuickAmountChips';
import { TokenSelectorPill } from '@/components/invest/TokenSelectorPill';
import { Card } from '@/components/ui/Card';
import { InfoRow } from '@/components/ui/InfoRow';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import {
  belowHlpMinimum,
  hlpAvailableUsd6,
  hlpBalanceLabel,
} from '@/integration/hyperliquidPanelModel';
import {
  amountInputToUsd6,
  amountUsdFromInput,
  normalizeAmountInput,
  quickAmountUsdInput,
} from '@/integration/investAmountModel';
import { resolveDepositExecutionCapability } from '@/integration/investExecutionModel';
import { useAccount } from '@/integration/useAccount';
import {
  useHlpPerpBalance,
  useHlpSpotBalance,
} from '@/integration/useHlpBalances';
import { useInvest } from '@/integration/useInvest';
import { useInvestExecution } from '@/integration/useInvestExecution';
import { formatUsd } from '@/lib/format';

/**
 * Step 1 for the HLP flow. The deposit is funded from the wallet's existing
 * HyperCore balance — no bridge, no EVM transaction — so both pots count
 * toward one ceiling: the vault debits perp, and any shortfall is moved from
 * spot first. This step only freezes the amount; both signatures are taken in
 * the reviewed flow.
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
  const amountUsd = amountUsdFromInput(amountInput);
  const fromAmount = amountInputToUsd6(amountInput);

  const hlpSpot = useHlpSpotBalance(account.address);
  const hlpPerp = useHlpPerpBalance(account.address);
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

  const balancesLoading = hlpSpot.isLoading || hlpPerp.isLoading;
  const balancesUnavailable = hlpSpot.isError || hlpPerp.isError;
  const availableUsd6 = account.isConnected
    ? hlpAvailableUsd6(
        hlpSpot.balance?.totalUsd6,
        hlpPerp.balance?.withdrawableUsd6,
      )
    : null;
  const availableLabel = balancesLoading
    ? 'Loading balances…'
    : availableUsd6 === null
      ? 'Available —'
      : `Available ${formatUsd(Number(formatUnits(availableUsd6, 6)))}`;

  const capability = resolveDepositExecutionCapability({
    isConnected: wallet.isConnected,
    executionMode: wallet.executionMode,
  });
  const belowMinimum = belowHlpMinimum(fromAmount);
  const hasAmount = amountUsd !== null && fromAmount !== '0';
  const exceedsBalance =
    availableUsd6 !== null && hasAmount && BigInt(fromAmount) > availableUsd6;
  const quickAmountsDisabled =
    !account.isConnected || availableUsd6 === null || availableUsd6 <= 0n;

  const handleQuickAmount = (bps: number) => {
    setAmountInput(
      quickAmountUsdInput(
        availableUsd6 === null ? null : Number(formatUnits(availableUsd6, 6)),
        bps,
      ),
    );
  };

  const reviewDeposit = () => {
    if (capability === 'connect-wallet') {
      void account.connect();
      return;
    }
    if (capability !== 'ready' || !hasAmount || belowMinimum || exceedsBalance)
      return;

    // A previous reviewed EVM execution is not valid evidence for this
    // HyperCore-funded deposit, even if the amount happens to match.
    resetReviewedExecution();

    // No `setScope` here: it force-resets the destination, and a HyperCore
    // deposit has no EVM source scope to select in the first place.
    invest.setDestination('hlp');
    invest.setAmountInput(amountInput);
    invest.setHyperCoreFundingDraft({
      source: 'hypercore-spot',
      requestedUsd6: fromAmount,
    });
    router.push('/invest/route');
  };

  return (
    <View className="mt-4">
      <Card className="p-4">
        <View className="flex-row items-center justify-between">
          <Text className="font-mono text-[10px] uppercase tracking-[1px] text-ink-dim">
            Hyperliquid USDC amount
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
          {/* No press handler: USDC on HyperCore is the only funding option,
              so the pill names the asset rather than opening a picker. */}
          <TokenSelectorPill
            symbol="USDC"
            chainKey="hyperliquid"
            accessibilityLabel="Funding asset: USDC on Hyperliquid"
          />
        </View>
        <Text className="mt-1 font-mono text-[11px] text-ink-dim">
          Spot {spotTotalLabel} · Perp {perpWithdrawableLabel}
        </Text>
        <QuickAmountChips
          disabled={quickAmountsDisabled}
          maxAccessibilityLabel="Use the full Hyperliquid balance"
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
        <InfoRow label="Destination" value="Official HLP vault" divider />
        <InfoRow label="Minimum deposit" value="10 USDC" divider />
        <InfoRow label="Withdrawal lock" value="4 days" divider />
        <InfoRow label="Network fee" value="None — signatures only" />
      </Card>

      {belowMinimum ? (
        <Text className="mt-2.5 px-1 text-[11px] text-error">
          Enter at least $10. The HLP vault rejects smaller deposits.
        </Text>
      ) : null}
      {exceedsBalance ? (
        <Text className="mt-2.5 px-1 text-[11px] text-error">
          This amount exceeds your Hyperliquid balance.
        </Text>
      ) : null}
      {balancesUnavailable ? (
        <Text className="mt-2.5 px-1 text-[11px] leading-4 text-error">
          Your Hyperliquid balance is unavailable right now, so the deposit
          cannot be sized. Retry in a moment.
        </Text>
      ) : null}

      <PrimaryButton
        className="mt-5"
        disabled={
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
            : 'Review HLP deposit'}
      </PrimaryButton>
      <Text className="mt-3 text-[10.5px] leading-[16px] text-ink-faint">
        Your wallet signs two gasless Hyperliquid actions: moving USDC from spot
        into perp, then depositing it into the HLP vault.
      </Text>
    </View>
  );
}
