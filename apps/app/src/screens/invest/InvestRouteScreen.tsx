import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { StepHeader } from '@/components/invest/StepHeader';
import { StepProgress } from '@/components/invest/StepProgress';
import { Card } from '@/components/ui/Card';
import { InfoRow } from '@/components/ui/InfoRow';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import {
  depositPathChainLabel,
  depositPathInputLabel,
  depositPathProtocolLabel,
} from '@/integration/depositPaths';
import {
  formatPlanDuration,
  formatPlanGas,
  planLegsToRouteRows,
  routeStepsLabel,
} from '@/integration/planPreviewFormatters';
import { useInvestDepositPlanPreview } from '@/integration/useInvest';
import { formatUsd } from '@/lib/format';

export function InvestRouteScreen() {
  const router = useRouter();
  const preview = useInvestDepositPlanPreview();
  const rows = planLegsToRouteRows(preview.plan?.legs);

  return (
    <ScreenScrollView>
      <StepHeader title="Route" step="Step 2 of 3" />
      <StepProgress current={2} />
      <View className="px-5 pt-6">
        <Text className="font-serif text-[28px] leading-[32px] text-ink">
          Preview route
        </Text>
        <Text className="mt-2 text-[12.5px] leading-[19px] text-ink-dim">
          {formatUsd(preview.amountUsd)} via{' '}
          {depositPathProtocolLabel(preview.selectedDepositPath)}
        </Text>
        <Card className="mt-5 p-4">
          <InfoRow
            label="Input"
            value={depositPathInputLabel(preview.selectedDepositPath)}
            divider
          />
          <InfoRow
            label="Chain"
            value={depositPathChainLabel(preview.selectedDepositPath)}
            divider
          />
          <InfoRow
            label="Steps"
            value={routeStepsLabel(preview.plan?.legs)}
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
          />
        </Card>
        <View className="mt-4 gap-3">
          {preview.isLoading ? (
            <SkeletonBlock className="h-[76px] w-full rounded-2xl" />
          ) : rows.length > 0 ? (
            rows.map((row) => (
              <Card key={row.id} className="p-4">
                <View className="flex-row items-center gap-3">
                  <View
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: row.dotColor }}
                  />
                  <View className="flex-1">
                    <Text className="font-sans-semibold text-[14px] text-ink">
                      {row.label}
                    </Text>
                    <Text className="mt-1 text-[12px] text-ink-dim">
                      {row.meta}
                    </Text>
                  </View>
                </View>
              </Card>
            ))
          ) : (
            <Card className="p-4">
              <Text className="font-sans-semibold text-[14px] text-ink">
                Route preview pending
              </Text>
              <Text className="mt-2 text-[12px] leading-[18px] text-ink-dim">
                Connect a wallet and enter an amount to fetch the live plan.
              </Text>
            </Card>
          )}
        </View>
        <PrimaryButton
          className="mt-5"
          onPress={() => router.push('/invest/confirm')}
        >
          Continue
        </PrimaryButton>
      </View>
    </ScreenScrollView>
  );
}
