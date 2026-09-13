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
  hlpAccountModeLabel,
  hlpBalanceLabel,
  hlpBalanceRows,
  hlpSpendableUsd6,
  hlpStandardAccountHint,
} from '@/integration/hyperliquidPanelModel';
import {
  amountInputToUsd6,
  amountUsdFromInput,
  normalizeAmountInput,
  quickAmountUsdInput,
} from '@/integration/investAmountModel';
import { useAccount } from '@/integration/useAccount';
import { useHyperCoreSpendable } from '@/integration/useHlpBalances';
import { useInvest } from '@/integration/useInvest';
import { useInvestExecution } from '@/integration/useInvestExecution';
import { formatUsd } from '@/lib/format';

/**
 * Step 1 for HLP. The deposit is funded by USDC already on Hyperliquid; the
 * service resolves whether a Unified or Standard account supplies the vault.
 */
export function HyperliquidDepositPanel() {
  const router = useRouter();
  const account = useAccount();
  const invest = useInvest();
  const { reset: resetReviewedExecution } = useInvestExecution();
  const [amountInput, setAmountInput] = useState(
    invest.destination === 'hlp' ? invest.amountInput : '',
  );
  const amountUsd = amountUsdFromInput(amountInput);
  const fromAmount = amountInputToUsd6(amountInput);

  const hyperCore = useHyperCoreSpendable(account.address);
  const balance = hyperCore.balance;
  const availableUsd6 = account.isConnected ? hlpSpendableUsd6(balance) : null;
  const availableLabel = hyperCore.isLoading
    ? 'Loading balance…'
    : availableUsd6 === null
      ? 'Available —'
      : `Available ${formatUsd(Number(formatUnits(availableUsd6, 6)))}`;
  const rowLabel = (value: bigint): string =>
    hlpBalanceLabel({
      isConnected: account.isConnected,
      isLoading: hyperCore.isLoading,
      isError: hyperCore.isError,
      value,
    });

  const belowMinimum = belowHlpMinimum(fromAmount);
  const hasAmount = amountUsd !== null && fromAmount !== '0';
  const exceedsBalance =
    availableUsd6 !== null && hasAmount && BigInt(fromAmount) > availableUsd6;
  const balanceUnavailable =
    account.isConnected &&
    (hyperCore.isLoading || hyperCore.isError || availableUsd6 === null);
  const quickAmountsDisabled =
    !account.isConnected || availableUsd6 === null || availableUsd6 <= 0n;
  const standardHint = hlpStandardAccountHint(balance);

  const handleQuickAmount = (bps: number) => {
    setAmountInput(
      quickAmountUsdInput(
        availableUsd6 === null ? null : Number(formatUnits(availableUsd6, 6)),
        bps,
      ),
    );
  };

  const reviewDeposit = () => {
    if (!account.isConnected) {
      void account.connect();
      return;
    }
    if (!hasAmount || belowMinimum || exceedsBalance || balanceUnavailable) {
      return;
    }

    resetReviewedExecution();
    invest.setDestination('hlp');
    invest.setAmountInput(amountInput);
    invest.setHyperCoreFundingDraft({
      source: 'hypercore-spot',
      requestedUsd6: fromAmount,
    });
    router.push('/invest/hlp-deposit');
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
          <TokenSelectorPill
            symbol="USDC"
            chainKey="hyperliquid"
            accessibilityLabel="Funding asset: USDC on Hyperliquid"
          />
        </View>
        {balance ? (
          <Text className="mt-1 font-mono text-[11px] text-ink-dim">
            Account mode · {hlpAccountModeLabel(balance.mode)}
          </Text>
        ) : null}
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
          {balance ? (
            <>
              <InfoRow
                label="Account mode"
                value={hlpAccountModeLabel(balance.mode)}
                divider
              />
              {hlpBalanceRows(balance).map((row, index, rows) => (
                <InfoRow
                  key={row.label}
                  label={row.label}
                  value={rowLabel(row.value)}
                  divider={index < rows.length - 1}
                />
              ))}
            </>
          ) : (
            <InfoRow
              label="Account mode"
              value={hyperCore.isLoading ? 'Loading…' : '—'}
            />
          )}
        </View>
      </Card>

      <Card className="mt-3 p-4">
        <InfoRow label="Destination" value="Official HLP vault" divider />
        <InfoRow label="Minimum deposit" value="10 USDC" divider />
        <InfoRow label="Withdrawal lock" value="4 days" divider />
        <InfoRow label="Network fee" value="None — no gas" />
      </Card>

      {standardHint ? (
        <Text className="mt-2.5 px-1 text-[11px] leading-4 text-ink-dim">
          {standardHint}
        </Text>
      ) : null}
      {belowMinimum ? (
        <Text className="mt-2.5 px-1 text-[11px] text-error">
          Enter at least $10. The HLP vault rejects smaller deposits.
        </Text>
      ) : null}
      {exceedsBalance ? (
        <Text className="mt-2.5 px-1 text-[11px] text-error">
          This amount exceeds your spendable Hyperliquid balance.
        </Text>
      ) : null}
      {hyperCore.isError ? (
        <Text className="mt-2.5 px-1 text-[11px] leading-4 text-error">
          Your Hyperliquid balance is unavailable right now, so the deposit
          cannot be sized. Retry in a moment.
        </Text>
      ) : null}

      <PrimaryButton
        className="mt-5"
        disabled={
          account.isConnected &&
          (!hasAmount || belowMinimum || exceedsBalance || balanceUnavailable)
        }
        onPress={reviewDeposit}
      >
        {account.isConnected ? 'Review HLP deposit' : CONNECT_WALLET_CTA}
      </PrimaryButton>
      <Text className="mt-3 text-[10.5px] leading-[16px] text-ink-faint">
        Zap Pilot deposits with a Hyperliquid signing key you approve once. The
        key can act inside your Hyperliquid account but can never withdraw or
        send funds to anyone else.
      </Text>
    </View>
  );
}
