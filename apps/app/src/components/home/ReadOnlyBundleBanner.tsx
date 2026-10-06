import { X } from 'lucide-react-native';
import { View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { IconButton } from '@/components/ui/IconButton';
import { Card } from '@/components/ui/Card';

import { Button } from '@/components/ui/Button';
import { setBundleView } from '@/integration/bundleViewStore';
import { useAccount } from '@/integration/useAccount';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

export function ReadOnlyBundleBanner({
  walletCount,
  address,
}: {
  walletCount: number;
  address: string | null;
}) {
  const account = useAccount();
  const { t } = useContentLanguage();
  if (!account.viewingUserId || account.isOwnBundle || account.isDemo)
    return null;
  const matched = account.bundleView?.matchedAddress ?? address;
  const abbreviated = matched
    ? `${matched.slice(0, 6)}…${matched.slice(-4)}`
    : '—';
  return (
    <Card className="mx-5 mt-3 gap-2" padding="sm">
      <Text variant="caption" tone="secondary">
        {t('home.readOnlyBundle', { address: abbreviated, count: walletCount })}
      </Text>
      {account.isConnected ? (
        <Button variant="secondary" onPress={() => setBundleView(null)}>
          {t('home.returnOwnBundle')}
        </Button>
      ) : (
        <View className="flex-row items-center justify-between">
          <Button
            variant="secondary"
            onPress={() => {
              void account.connect();
            }}
          >
            {t('home.bundleLogin')}
          </Button>
          <IconButton
            icon={X}
            variant="ghost"
            accessibilityLabel={t('home.clearWalletSearch')}
            onPress={() => setBundleView(null)}
          />
        </View>
      )}
    </Card>
  );
}
