import { Wallet } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { NATIVE_PRIVY_AUTH_COPY } from '@/integration/nativePrivyLogin';

interface ConnectPromptCardProps {
  title: string;
  body: string;
  onConnect: () => void;
}

/** Sign-in CTA card used by the logged-out /home demo-blur overlay. */
export function ConnectPromptCard({
  title,
  body,
  onConnect,
}: ConnectPromptCardProps) {
  return (
    <Card className="items-center p-6">
      <View className="h-11 w-11 items-center justify-center rounded-full border border-[rgba(212,197,163,.3)] bg-[rgba(212,197,163,.12)]">
        <Wallet size={19} strokeWidth={1.8} color="#d4c5a3" />
      </View>
      <Text className="mt-3 text-center font-sans-semibold text-[15px] text-ink">
        {title}
      </Text>
      <Text className="mt-1 text-center text-[12.5px] leading-5 text-ink-dim">
        {body}
      </Text>
      <PrimaryButton className="mt-4" onPress={onConnect}>
        {NATIVE_PRIVY_AUTH_COPY.cta}
      </PrimaryButton>
    </Card>
  );
}
