import { AppVersionCard } from '@/components/account/AppVersionCard';
import { usePrivy } from '@privy-io/expo';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';

import { LanguageSettingsCard } from '@/components/account/LanguageSettingsCard';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Tap } from '@/components/ui/Tap';
import {
  readIosWatchPortfolioAddress,
  writeIosWatchPortfolioAddress,
} from '@/integration/iosWatchPortfolioAddress';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

const ETHEREUM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export function RuntimeYouSection() {
  const { logout } = usePrivy();
  const { t } = useContentLanguage();
  const [watchAddress, setWatchAddress] = useState('');
  const [savingWatchAddress, setSavingWatchAddress] = useState(false);
  const [watchAddressError, setWatchAddressError] = useState<string | null>(
    null,
  );
  const [watchAddressSaved, setWatchAddressSaved] = useState(false);

  useEffect(() => {
    let active = true;
    void readIosWatchPortfolioAddress().then((address) => {
      if (active) setWatchAddress(address ?? '');
    });
    return () => {
      active = false;
    };
  }, []);

  const saveWatchAddress = async () => {
    const normalized = watchAddress.trim();
    setWatchAddressSaved(false);
    setWatchAddressError(null);
    if (normalized && !ETHEREUM_ADDRESS_PATTERN.test(normalized)) {
      setWatchAddressError(t('account.watchAddressInvalid'));
      return;
    }

    setSavingWatchAddress(true);
    try {
      await writeIosWatchPortfolioAddress(normalized || null);
      setWatchAddress(normalized.toLowerCase());
      setWatchAddressSaved(true);
    } finally {
      setSavingWatchAddress(false);
    }
  };

  const clearWatchAddress = () => {
    setWatchAddress('');
    setWatchAddressError(null);
    setWatchAddressSaved(false);
    void writeIosWatchPortfolioAddress(null);
  };

  return (
    <View>
      <View className="pt-5">
        <Card className="p-5">
          <Text className="font-text-semibold text-body text-ink">
            {t('runtime.you')}
          </Text>
          <Text className="font-text mt-2 text-caption leading-5 text-ink-2">
            {t('account.iosAuthBody')}
          </Text>
        </Card>

        <LanguageSettingsCard />
        <AppVersionCard />

        <Card className="mt-4 p-5">
          <Text className="font-text-semibold text-body text-ink">
            {t('account.watchAddressTitle')}
          </Text>
          <Text className="font-text mt-1 text-caption leading-5 text-ink-2">
            {t('account.watchAddressBody')}
          </Text>
          <TextField
            label={t('account.watchAddressTitle')}
            className="mt-4 rounded-panel border border-rule bg-well px-4 py-3 font-mono text-data text-ink"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={t('account.watchAddressPlaceholder')}
            value={watchAddress}
            onChangeText={(value) => {
              setWatchAddress(value);
              setWatchAddressError(null);
              setWatchAddressSaved(false);
            }}
          />
          {watchAddressError ? (
            <Text className="font-mono-medium mt-2 text-label leading-[16px] text-alert">
              {watchAddressError}
            </Text>
          ) : null}
          {watchAddressSaved ? (
            <Text className="font-mono-medium mt-2 text-label leading-[16px] text-ink">
              {t('account.watchAddressSaved')}
            </Text>
          ) : null}
          <Button
            className="mt-4"
            variant="secondary"
            disabled={savingWatchAddress}
            onPress={() => void saveWatchAddress()}
          >
            {t('account.watchAddressSave')}
          </Button>
          {watchAddress.trim() ? (
            <Tap
              className="mt-3 min-h-9 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel={t('account.watchAddressClear')}
              onPress={clearWatchAddress}
            >
              <Text className="font-text-semibold text-caption text-ink-2">
                {t('account.watchAddressClear')}
              </Text>
            </Tap>
          ) : null}
        </Card>

        <Card className="mt-4 p-5">
          <Text className="font-text-semibold text-body text-ink">
            {t('account.webFeaturesTitle')}
          </Text>
          <Text className="font-text mt-1 text-caption leading-5 text-ink-2">
            {t('account.webFeaturesBody')}
          </Text>
        </Card>

        <Button
          className="mt-5"
          variant="secondary"
          onPress={() => void logout()}
        >
          {t('account.signOut')}
        </Button>
      </View>
    </View>
  );
}
