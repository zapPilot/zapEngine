import { usePrivy } from '@privy-io/expo';
import { Text, View } from 'react-native';

import { ContentLanguageOptionRows } from '@/components/content/ContentLanguageSelector';
import { OpenZapPilotWebButton } from '@/components/OpenZapPilotWebButton';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';

export function AccountScreen() {
  const { logout } = usePrivy();

  return (
    <ScreenScrollView>
      <ScreenHeader title="Settings" />
      <View className="px-5 pt-5">
        <Card className="p-5">
          <Text className="font-sans-semibold text-[15px] text-ink">
            Account
          </Text>
          <Text className="mt-2 text-[12.5px] leading-5 text-ink-dim">
            Signed in with Privy. The iOS app uses Privy only for account
            authentication.
          </Text>
        </Card>

        <Card className="mt-4 p-5">
          <Text className="font-sans-semibold text-[15px] text-ink">
            Content language
          </Text>
          <Text className="mt-1 text-[12.5px] leading-5 text-ink-dim">
            Choose the language used for podcast and editorial content.
          </Text>
          <View className="mt-3">
            <ContentLanguageOptionRows />
          </View>
        </Card>

        <Card className="mt-4 p-5">
          <Text className="font-sans-semibold text-[15px] text-ink">
            Zap Pilot Web
          </Text>
          <Text className="mt-1 text-[12.5px] leading-5 text-ink-dim">
            Additional Zap Pilot features are available in the web app.
          </Text>
          <OpenZapPilotWebButton className="mt-4" />
        </Card>

        <PrimaryButton
          className="mt-5"
          variant="secondary"
          onPress={() => void logout()}
        >
          Sign out
        </PrimaryButton>
      </View>
    </ScreenScrollView>
  );
}
