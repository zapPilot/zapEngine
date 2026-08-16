import { ExternalLink } from 'lucide-react-native';
import { Linking, Text } from 'react-native';

import { PrimaryButton } from '@/components/ui/PrimaryButton';

export const ZAP_PILOT_WEB_URL = 'https://v2.zap-pilot.org';

export function OpenZapPilotWebButton({ className }: { className?: string }) {
  return (
    <PrimaryButton
      {...(className === undefined ? {} : { className })}
      onPress={() => void Linking.openURL(ZAP_PILOT_WEB_URL)}
    >
      <Text className="font-sans-semibold text-[14px] text-[#0a0a0a]">
        Open Zap Pilot Web
      </Text>
      <ExternalLink size={15} strokeWidth={1.8} color="#0a0a0a" />
    </PrimaryButton>
  );
}
