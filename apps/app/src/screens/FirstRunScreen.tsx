import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { BrandLockup } from '@/components/ui/BrandLockup';
import { Button } from '@/components/ui/Button';
import { RuntimeModelStage } from '@/components/runtime-model/RuntimeModelStage';
import { KineticHeadline } from '@/components/firstRun/KineticHeadline';
import { FirstRunStatusRows } from '@/components/firstRun/FirstRunStatusRows';
import { FirstRunActions } from '@/components/firstRun/FirstRunActions';
import { useAccount } from '@/integration/useAccount';
import { APP_ROUTES } from '@/integration/navigationModel';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { contentLanguageBadge } from '@/config/contentLanguages';
const LANGUAGES = ['en', 'zh-Hant', 'ja'] as const;
export function FirstRunScreen() {
  const router = useRouter();
  const account = useAccount();
  const { languageCode, setLanguageCode, t } = useContentLanguage();
  useEffect(() => {
    if (account.isConnected) router.replace(APP_ROUTES.today);
  }, [account.isConnected, router]);
  return (
    <ScreenScrollView width="narrow">
      <View className="gap-6 py-5">
        <View className="flex-row items-center justify-between">
          <BrandLockup />
          <Button
            variant="ghost"
            size="sm"
            accessibilityLabel={t('firstRun.language')}
            onPress={() =>
              setLanguageCode(
                LANGUAGES[
                  (LANGUAGES.indexOf(languageCode) + 1) % LANGUAGES.length
                ]!,
              )
            }
          >
            {contentLanguageBadge(languageCode)}
          </Button>
        </View>
        <KineticHeadline />
        <RuntimeModelStage variant="firstRun" />
        <FirstRunStatusRows />
        <FirstRunActions onExplore={() => router.replace(APP_ROUTES.today)} />
      </View>
    </ScreenScrollView>
  );
}
