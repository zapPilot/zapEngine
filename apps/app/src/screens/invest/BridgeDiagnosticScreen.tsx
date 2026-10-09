import { Redirect } from 'expo-router';
import { Text, View } from 'react-native';

import { BridgeTestPanel } from '@/components/invest/BridgeTestPanel';
import { InvestStepHeader } from '@/components/invest/InvestStepHeader';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { isDevBuild } from '@/config/appCoreEnv';
import { APP_ROUTES } from '@/integration/navigationModel';

/**
 * Developer-only canonical USDC bridge probe. It is not part of the invest
 * flow, so production builds redirect rather than render it.
 */
export function BridgeDiagnosticScreen() {
  if (!isDevBuild()) {
    return <Redirect href={APP_ROUTES.today} />;
  }

  return (
    <ScreenScrollView width="narrow">
      <InvestStepHeader title="Invest" step="Bridge test" />
      <View className="pt-5">
        <Text className="font-display text-title leading-[32px] text-ink">
          Bridge USDC
        </Text>
        <Text className="font-text mt-2 text-caption leading-[19px] text-ink-2">
          Test canonical USDC transfers through LI.FI without entering a
          strategy.
        </Text>
        <BridgeTestPanel />
      </View>
    </ScreenScrollView>
  );
}
