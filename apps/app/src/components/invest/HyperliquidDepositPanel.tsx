import { useDepositWizard } from '@zapengine/app-core/hooks/useDepositWizard';
import { useWalletProvider } from '@zapengine/app-core/providers/walletContext';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Text, TextInput, View } from 'react-native';

import { CONNECT_WALLET_CTA } from '@/components/connect/connectCopy';
import { HyperliquidDepositCard } from '@/components/invest/HyperliquidDepositCard';
import { WizardDoneCard } from '@/components/invest/WizardDoneCard';
import { WizardLegList } from '@/components/invest/WizardLegList';
import { Card } from '@/components/ui/Card';
import { InfoRow } from '@/components/ui/InfoRow';
import { InlineErrorCard } from '@/components/ui/InlineErrorCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Tap } from '@/components/ui/Tap';
import { DEFAULT_BASE_FUNDING_TOKEN } from '@/integration/depositTokens';
import {
  amountInputToUsd6,
  amountUsdFromInput,
  normalizeAmountInput,
} from '@/integration/investAmountModel';
import {
  hyperliquidAccountUrl,
  resolveDepositExecutionCapability,
  wizardLegRows,
} from '@/integration/investExecutionModel';
import {
  belowHlpMinimum,
  hlpDoneStatusLabel,
  hlpErrorAction,
  HYPERLIQUID_HLP_SPLIT,
} from '@/integration/hyperliquidPanelModel';
import { formatPlanGas } from '@/integration/planPreviewFormatters';
import { useAccount } from '@/integration/useAccount';
import { useDepositPlanPreview } from '@/integration/useDepositPlanPreview';
import { useInvestableBalances } from '@/integration/useInvestableBalances';
import { formatUsd } from '@/lib/format';

const BASE_CHAIN_ID = 8453;

/**
 * Base USDC → HyperCore bridge + HLP vault deposit. Runs its own wizard
 * outside the unified invest review because the unified execution path has no
 * concept of the plan's `followUps` (the gasless HLP vaultTransfer).
 */
export function HyperliquidDepositPanel() {
  const router = useRouter();
  const account = useAccount();
  const wallet = useWalletProvider();
  const { wizard, pending, start, runHlpDeposit, retry, reset } =
    useDepositWizard();
  const [amountInput, setAmountInput] = useState('');
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
  const isConfigure = wizard.stage === 'configure' && wizard.plan === null;
  const rows = wizardLegRows(wizard.legs, BASE_CHAIN_ID);
  const showHlp = wizard.stage === 'hyperliquidDeposit' && wizard.hlp.step;
  const isDone = wizard.stage === 'done';
  const belowMinimum = belowHlpMinimum(fromAmount);
  const accountUrl = hyperliquidAccountUrl(wizard.hlp, account.address);

  return (
    <View className="mt-4">
      {isConfigure ? (
        <>
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
                onChangeText={(value) =>
                  setAmountInput(normalizeAmountInput(value))
                }
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
              Enter at least $6 — the HLP vault requires $5 after bridge fees.
            </Text>
          ) : null}
          <PrimaryButton
            className="mt-5"
            disabled={
              pending ||
              amountUsd === null ||
              fromAmount === '0' ||
              belowMinimum ||
              preview.isError ||
              capability === 'unsupported-wallet'
            }
            onPress={() => {
              if (capability === 'connect-wallet') {
                void account.connect();
                return;
              }
              if (capability !== 'ready') return;
              void start({
                fromToken: DEFAULT_BASE_FUNDING_TOKEN.depositAddress,
                fromAmount,
                split: HYPERLIQUID_HLP_SPLIT,
              });
            }}
          >
            {capability === 'connect-wallet'
              ? CONNECT_WALLET_CTA
              : capability === 'unsupported-wallet'
                ? 'Use a supported web wallet'
                : pending
                  ? 'Preparing…'
                  : 'Start HLP deposit'}
          </PrimaryButton>
        </>
      ) : null}

      {wizard.error ? (
        <View className="mt-5">
          <InlineErrorCard
            body={wizard.error.message}
            action={
              hlpErrorAction(wizard.error.stage) === 'retry'
                ? { label: 'Try again', onPress: retry }
                : { label: 'Return to setup', onPress: reset }
            }
          />
        </View>
      ) : null}

      {rows.length > 0 ? (
        <View className="mt-5">
          <WizardLegList rows={rows} />
        </View>
      ) : null}

      {showHlp ? (
        <View className="mt-4">
          <HyperliquidDepositCard
            hlp={wizard.hlp}
            userAddress={account.address}
            onDeposit={() => void runHlpDeposit()}
          />
        </View>
      ) : null}

      {isDone ? (
        <>
          <WizardDoneCard
            amountLabel={formatUsd(amountUsd ?? 0)}
            statusLabel={hlpDoneStatusLabel(wizard.hlp.status)}
            onDone={() => {
              reset();
              router.replace('/home');
            }}
          />
          {wizard.hlp.status === 'submittedUnverified' && accountUrl ? (
            <Tap
              className="mt-3 self-start"
              onPress={() => void Linking.openURL(accountUrl)}
            >
              <Text className="text-[12px] text-accent underline">
                View your Hyperliquid account
              </Text>
            </Tap>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
