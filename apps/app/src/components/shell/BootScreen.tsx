import { tokens } from '@zapengine/design-tokens/tokens';
import { View } from 'react-native';
import { ZapLogo } from '@/components/ui/ZapLogo';
export function BootScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-bg">
      <ZapLogo size={tokens.size.control.lg} />
    </View>
  );
}
