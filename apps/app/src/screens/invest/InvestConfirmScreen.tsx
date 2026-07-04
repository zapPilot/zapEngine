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
import { useInvestDepositPlanPreview } from '@/integration/useInvest';
import { formatUsd } from '@/lib/format';

export function InvestConfirmScreen() {
  const preview = useInvestDepositPlanPreview();

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
        <View className="mt-4">
          <NonCustodialCard
            title="Wallet signature required"
            body="The native wallet backend will request signatures here once Privy is connected."
          />
        </View>
        <PrimaryButton className="mt-5" disabled={true}>
          Sign and invest
        </PrimaryButton>
      </View>
    </ScreenScrollView>
  );
}
