import { useWalletProvider } from '@zapengine/app-core/providers/walletContext';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { CONNECT_WALLET_CTA } from '@/components/connect/connectCopy';
import { Card } from '@/components/ui/Card';
import { InfoRow } from '@/components/ui/InfoRow';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { DEFAULT_BASE_FUNDING_TOKEN } from '@/integration/depositTokens';
import {
  amountInputToUsd6,
  amountUsdFromInput,
  normalizeAmountInput,
} from '@/integration/investAmountModel';
import { resolveDepositExecutionCapability } from '@/integration/investExecutionModel';
import {
  belowHlpMinimum,
  HYPERLIQUID_HLP_SPLIT,
} from '@/integration/hyperliquidPanelModel';
import { formatPlanGas } from '@/integration/planPreviewFormatters';
import { useAccount } from '@/integration/useAccount';
import { useDepositPlanPreview } from '@/integration/useDepositPlanPreview';
import { useInvest } from '@/integration/useInvest';
import { useInvestableBalances } from '@/integration/useInvestableBalances';
import { formatUsd } from '@/lib/format';

const BASE_CHAIN_ID = 8453;

/**
 * Step 1 for the unified HLP flow. This component only freezes the exact Base
 * USDC funding draft and routes into `/invest/route`; execution lives in the
 * same reviewed flow as the other invest destinations.
 */
export function HyperliquidDepositPanel() {
  const router = useRouter();
  const account = useAccount();
  const invest = useInvest();
  const wallet = useWalletProvider();
  const routingToReviewRef = useRef(false);
  const [amountInput, setAmountInput] = useState(
    invest.destination === 'hlp' ? invest.amountInput : '',
  );
  const amountUsd = amountUsdFromInput(amountInput);
  const fromAmount = amountInputToUsd6(amountInput);
  const balances = useInvestableBalances(account.address);
  const preview = useDepositPlanPreview({
    address: account.address,
    fromToken: DEFAULT_BASE_FUNDING_TOKEN.depositAddress,
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

  useEffect(
    () => () => {
      // Switching from the HLP tab back to a normal scope must not leave the
      // HLP destination armed. Navigation into the HLP review intentionally
      // preserves it across the route transition.
      if (!routingToReviewRef.current) {
        invest.setDestination('strategy');
      }
    },
    [invest.setDestination],
  );

  const reviewDeposit = () => {
    if (capability === 'connect-wallet') {
      void account.connect();
      return;
    }
    if (capability !== 'ready' || !hasAmount || belowMinimum) return;

    // Set all draft dimensions first; each setter intentionally clears stale
    // frozen execution state. Freeze the exact USDC amount last.
    invest.setScope('base');
    invest.setDestination('hlp');
    invest.setBaseFundingToken(DEFAULT_BASE_FUNDING_TOKEN);
    invest.setAmountInput(amountInput);
    invest.setSingleChainFundingDraft({
      scope: 'base',
      chainId: BASE_CHAIN_ID,
      fromToken: DEFAULT_BASE_FUNDING_TOKEN.depositAddress,
      fromAmount,
    });
    routingToReviewRef.current = true;
    router.push('/invest/route');
  };

  return (
    <View className="mt-4">
      <Card className="p-4">
        <Text className="font-mono text-[10px] uppercase tracking-[1px] text-ink-dim">
          Base USDC amount
        </Text>
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
            onChangeText={(value) => setAmountInput(normalizeAmountInput(value))}
          />
          <Text className="font-sans-semibold text-[12px] text-ink-dim">
            USDC
          </Text>
        </View>
      </Card>

      <Card className="mt-3 p-4">
        <InfoRow
          label="Supported wallet assets"
          value={
            balances.isLoading
              ? 'Loading…'
              : balances.totalUsdValue === null
                ? '—'
                : formatUsd(balances.totalUsdValue)
          }
          divider
        />
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
  );
}
