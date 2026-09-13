import { Redirect } from 'expo-router';
import { Text, View } from 'react-native';

import { BridgeTestPanel } from '@/components/invest/BridgeTestPanel';
import { StepHeader } from '@/components/invest/StepHeader';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { isDevBuild } from '@/config/appCoreEnv';

/**
 * Developer-only canonical USDC bridge probe. It is not part of the invest
 * flow, so production builds redirect rather than render it.
 */
export function BridgeDiagnosticScreen() {
  if (!isDevBuild()) {
    return <Redirect href="/invest/amount" />;
  }

  return (
    <ScreenScrollView>
      <StepHeader title="Invest" step="Bridge test" />
      <View className="px-5 pt-5">
        <Text className="font-serif text-[28px] leading-[32px] text-ink">
          Bridge USDC
        </Text>
        <Text className="mt-2 text-[12.5px] leading-[19px] text-ink-dim">
          Test canonical USDC transfers through LI.FI without entering a
          strategy.
        </Text>
        <BridgeTestPanel />
      </View>
    </ScreenScrollView>
  );
}
