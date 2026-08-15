import { ExternalLink, LockKeyhole } from 'lucide-react-native';
import type { ReactElement, ReactNode } from 'react';
import { Linking, Text, View } from 'react-native';

import { APP_RUNTIME } from '@/config/appRuntime';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';

const ZAP_PILOT_WEB_URL = 'https://v2.zap-pilot.org';

export function FinancialFeatureRoute({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}): ReactElement {
  if (APP_RUNTIME !== 'native') {
    return <>{children}</>;
  }

  return (
    <ScreenScrollView>
      <ScreenHeader title={title} />
      <View className="px-5 pt-8">
        <Card className="items-center p-6">
          <View className="h-12 w-12 items-center justify-center rounded-full border border-line bg-[rgba(212,197,163,.08)]">
            <LockKeyhole size={20} strokeWidth={1.8} color="#d4c5a3" />
          </View>
          <Text className="mt-4 text-center font-sans-semibold text-[17px] text-ink">
            Available on Zap Pilot Web
          </Text>
          <Text className="mt-2 text-center text-[12.5px] leading-5 text-ink-dim">
            This feature is not available in the iOS app. Open the web app to
            use the full Zap Pilot experience.
          </Text>
          <PrimaryButton
            className="mt-5 w-full"
            onPress={() => void Linking.openURL(ZAP_PILOT_WEB_URL)}
          >
            <Text className="font-sans-semibold text-[14px] text-[#0a0a0a]">
              Open Zap Pilot Web
            </Text>
            <ExternalLink size={15} strokeWidth={1.8} color="#0a0a0a" />
          </PrimaryButton>
        </Card>
      </View>
    </ScreenScrollView>
  );
}
