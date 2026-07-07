import { Redirect, useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { HyperliquidDepositCard } from '@/components/invest/HyperliquidDepositCard';
import { StepHeader } from '@/components/invest/StepHeader';
import { WizardDoneCard } from '@/components/invest/WizardDoneCard';
import { WizardErrorCard } from '@/components/invest/WizardErrorCard';
import { WizardLegList } from '@/components/invest/WizardLegList';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { wizardLegRows } from '@/integration/investExecutionModel';
import { useAccount } from '@/integration/useAccount';
import { useInvest } from '@/integration/useInvest';
import { useInvestExecution } from '@/integration/useInvestExecution';
import { formatUsd } from '@/lib/format';

const STAGE_TITLES: Record<string, string> = {
  configure: 'Preparing',
  sourceExecution: 'Executing on Base',
  bridging: 'Bridging',
  hyperliquidDeposit: 'Hyperliquid deposit',
  done: 'Done',
};

/**
 * Post-confirm execution progress. The wizard's machine stages advance on
 * their own (source batch → bridge polling → HLP arrival), so this single
 * route renders all of them instead of one route per stage.
 */
export function InvestProgressScreen() {
  const router = useRouter();
  const { address } = useAccount();
  const { amountUsd, sourceChainId } = useInvest();
  const { wizard, pending, runHlpDeposit, retry, reset } = useInvestExecution();

  // Deep link / refresh with no wizard in flight — nothing to show here.
  if (wizard.stage === 'configure' && !pending && !wizard.error) {
    return <Redirect href="/invest/amount" />;
  }

  const rows = wizardLegRows(wizard.legs, sourceChainId);
  const showHlp = wizard.stage === 'hyperliquidDeposit' && wizard.hlp.step;
  const isDone = wizard.stage === 'done';

  return (
    <ScreenScrollView>
      <StepHeader
        title={STAGE_TITLES[wizard.stage] ?? 'Executing'}
        step="Execution"
      />
      <View className="px-5 pt-6">
        <Text className="font-serif text-[28px] leading-[32px] text-ink">
          {isDone ? 'Investment complete' : 'Executing your deposit'}
        </Text>

        {wizard.error && (
          <View className="mt-5">
            <WizardErrorCard message={wizard.error.message} onDismiss={retry} />
          </View>
        )}

        {wizard.stage === 'configure' && !wizard.error && (
          <View className="mt-5 gap-3">
            <SkeletonBlock className="h-[52px] rounded-2xl" />
            <SkeletonBlock className="h-[52px] rounded-2xl" />
            <Text className="text-[12.5px] text-ink-dim">
              Preparing your plan — your wallet will ask for a signature.
            </Text>
          </View>
        )}

        {rows.length > 0 && (
          <View className="mt-5">
            <WizardLegList rows={rows} />
          </View>
        )}

        {showHlp && (
          <View className="mt-4">
            <HyperliquidDepositCard
              hlp={wizard.hlp}
              userAddress={address}
              onDeposit={() => void runHlpDeposit()}
            />
          </View>
        )}

        {isDone && (
          <WizardDoneCard
            amountLabel={formatUsd(amountUsd)}
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
        )}
      </View>
    </ScreenScrollView>
  );
}
