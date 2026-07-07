import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { StepHeader } from '@/components/invest/StepHeader';
import { Card } from '@/components/ui/Card';
import { StepProgress } from '@/components/invest/StepProgress';
import { NonCustodialCard } from '@/components/ui/NonCustodialCard';
import { InfoRow } from '@/components/ui/InfoRow';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import {
  formatPlanDuration,
  formatPlanGas,
} from '@/integration/planPreviewFormatters';
import { useAccount } from '@/integration/useAccount';
import { useInvestDepositPlanPreview } from '@/integration/useInvest';
import { useInvestExecution } from '@/integration/useInvestExecution';
import { formatUsd } from '@/lib/format';

const CAPABILITY_NOTICE = {
  'connect-wallet': {
    title: 'Connect your wallet',
    body: 'Connect a wallet to sign and execute this deposit.',
  },
  'unsupported-wallet': {
    title: 'Execution needs the web app for now',
    body: 'This wallet backend cannot batch the deposit transactions yet. Open Zap Pilot on the web to execute.',
  },
  'unsupported-path': {
    title: 'Wallet signature required',
    body: 'GMX deposits execute through the classic flow; wizard execution covers the Base invest path.',
  },
} as const;

export function InvestConfirmScreen() {
  const router = useRouter();
  const account = useAccount();
  const preview = useInvestDepositPlanPreview();
  const { capability, pending, startFromDraft } = useInvestExecution();

  const ready = capability === 'ready';
  const canConnect = capability === 'connect-wallet';
  const ctaLabel = canConnect
    ? account.isConnecting
      ? 'Connecting…'
      : 'Connect wallet'
    : pending
      ? 'Preparing…'
      : 'Sign and invest';

  return (
    <ScreenScrollView>
      <StepHeader title="Confirm" step="Step 3 of 3" />
      <StepProgress current={3} />
      <View className="px-5 pt-6">
        <Text className="font-serif text-[28px] leading-[32px] text-ink">
          Confirm investment
        </Text>
        <Card className="mt-5 p-4">
          <InfoRow
            label="Amount"
            value={formatUsd(preview.amountUsd)}
            divider
          />
          <InfoRow
            label="Gas"
            value={formatPlanGas(preview.plan?.totalGasUsd)}
            divider
          />
          <InfoRow
            label="Time"
            value={formatPlanDuration(preview.plan?.legs)}
            divider
          />
          <InfoRow
            label="Transactions"
            value={String(
              (preview.plan?.approvals.length ?? 0) +
                (preview.plan?.calls.length ?? 0),
            )}
          />
        </Card>
        {!ready && (
          <View className="mt-4">
            <NonCustodialCard
              title={CAPABILITY_NOTICE[capability].title}
              body={CAPABILITY_NOTICE[capability].body}
            />
          </View>
        )}
        <PrimaryButton
          className="mt-5"
          disabled={
            account.isConnecting ||
            pending ||
            preview.amountUsd <= 0 ||
            (!ready && !canConnect)
          }
          onPress={() => {
            if (canConnect) {
              void account.connect();
              return;
            }
            if (!ready) {
              return;
            }
            void startFromDraft();
            router.push('/invest/progress');
          }}
        >
          {ctaLabel}
        </PrimaryButton>
      </View>
    </ScreenScrollView>
  );
}
