import { useDepositWizard } from '@zapengine/app-core/hooks/useDepositWizard';
import { useWalletProvider } from '@zapengine/app-core/providers/walletContext';
import { useRouter } from 'expo-router';
import { Text, TextInput, View } from 'react-native';

import { HyperliquidDepositCard } from '@/components/invest/HyperliquidDepositCard';
import { StepHeader } from '@/components/invest/StepHeader';
import { WizardDoneCard } from '@/components/invest/WizardDoneCard';
import { WizardErrorCard } from '@/components/invest/WizardErrorCard';
import { WizardLegList } from '@/components/invest/WizardLegList';
import { Card } from '@/components/ui/Card';
import { InfoRow } from '@/components/ui/InfoRow';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { DEFAULT_BASE_FUNDING_TOKEN } from '@/integration/depositTokens';
import { DEFAULT_DEPOSIT_PATH } from '@/integration/depositPaths';
import {
  amountInputToUsd6,
  amountUsdFromInput,
  normalizeAmountInput,
} from '@/integration/investAmountModel';
import {
  resolveDepositExecutionCapability,
  wizardLegRows,
} from '@/integration/investExecutionModel';
import { useAccount } from '@/integration/useAccount';
import { useDepositPlanPreview } from '@/integration/useDepositPlanPreview';
import { useInvestableBalances } from '@/integration/useInvestableBalances';
import { formatPlanGas } from '@/integration/planPreviewFormatters';
import { formatUsd } from '@/lib/format';
import { useState } from 'react';

const STAGE_TITLES: Record<string, string> = {
  configure: 'Hyperliquid',
  sourceExecution: 'Executing on Base',
  bridging: 'Bridging',
  hyperliquidDeposit: 'Hyperliquid deposit',
  done: 'Done',
};

export function LegacyHyperliquidScreen() {
  const router = useRouter();
  const account = useAccount();
  const wallet = useWalletProvider();
  const { wizard, pending, start, runHlpDeposit, reset } = useDepositWizard();
  const [amountInput, setAmountInput] = useState('');
  const amountUsd = amountUsdFromInput(amountInput, 'USD', 1);
  const fromAmount = amountInputToUsd6(amountInput);
  const balances = useInvestableBalances(account.address);
  const preview = useDepositPlanPreview({
    address: account.address,
    fromToken: DEFAULT_BASE_FUNDING_TOKEN.depositAddress,
    fromAmount,
    sourceChainId: 8453,
    amountUsd: amountUsd ?? 0,
    depositPath: DEFAULT_DEPOSIT_PATH,
  });
  const capability = resolveDepositExecutionCapability({
    isConnected: wallet.isConnected,
    executionMode: wallet.executionMode,
    depositPath: DEFAULT_DEPOSIT_PATH,
  });
  const isConfigure = wizard.stage === 'configure' && wizard.plan === null;
  const rows = wizardLegRows(wizard.legs, 8453);
  const showHlp = wizard.stage === 'hyperliquidDeposit' && wizard.hlp.step;
  const isDone = wizard.stage === 'done';

  return (
    <ScreenScrollView>
      <StepHeader
        title={STAGE_TITLES[wizard.stage] ?? 'Hyperliquid'}
        step="Legacy flow"
      />
      <View className="px-5 pt-6">
        <Text className="font-serif text-[28px] leading-[32px] text-ink">
          {isDone ? 'Hyperliquid investment complete' : 'Base to Hyperliquid'}
        </Text>
        <Text className="mt-2 text-[12.5px] leading-[19px] text-ink-dim">
          The existing Base batch, real bridge polling, and manual HLP deposit
          flow remains available here.
        </Text>

        {isConfigure ? (
          <>
            <Card className="mt-5 p-4">
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
            <PrimaryButton
              className="mt-5"
              disabled={
                pending ||
                amountUsd === null ||
                fromAmount === '0' ||
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
                });
              }}
            >
              {capability === 'connect-wallet'
                ? 'Connect wallet'
                : capability === 'unsupported-wallet'
                  ? 'Use a supported web wallet'
                  : pending
                    ? 'Preparing…'
                    : 'Start Hyperliquid flow'}
            </PrimaryButton>
          </>
        ) : null}

        {wizard.error ? (
          <View className="mt-5">
            <WizardErrorCard
              message={wizard.error.message}
              actionLabel="Return to setup"
              onDismiss={reset}
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
          <WizardDoneCard
            amountLabel={formatUsd(amountUsd ?? 0)}
            statusLabel={
              wizard.hlp.status === 'deposited'
                ? 'Deposited (incl. HLP)'
                : 'Deposited'
            }
            onDone={() => {
              reset();
              router.replace('/home');
            }}
          />
        ) : null}
      </View>
    </ScreenScrollView>
  );
}
