import { usePrivy } from '@privy-io/expo';
import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { LanguageSettingsCard } from '@/components/account/LanguageSettingsCard';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { Tap } from '@/components/ui/Tap';
import {
  readIosWatchPortfolioAddress,
  writeIosWatchPortfolioAddress,
} from '@/integration/iosWatchPortfolioAddress';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

const ETHEREUM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export function AccountScreen() {
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
    <ScreenScrollView>
      <ScreenHeader title={t('account.settingsTitle')} />
      <View className="px-5 pt-5">
        <Card className="p-5">
          <Text className="font-sans-semibold text-[15px] text-ink">
            {t('tabs.account')}
          </Text>
          <Text className="mt-2 text-[12.5px] leading-5 text-ink-dim">
            {t('account.iosAuthBody')}
          </Text>
        </Card>

        <LanguageSettingsCard />

        <Card className="mt-4 p-5">
          <Text className="font-sans-semibold text-[15px] text-ink">
            {t('account.watchAddressTitle')}
          </Text>
          <Text className="mt-1 text-[12.5px] leading-5 text-ink-dim">
            {t('account.watchAddressBody')}
          </Text>
          <TextInput
            className="mt-4 rounded-2xl border border-line bg-[rgba(255,255,255,.035)] px-4 py-3 font-mono text-[13px] text-ink"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={t('account.watchAddressPlaceholder')}
            placeholderTextColor="#52525b"
            value={watchAddress}
            onChangeText={(value) => {
              setWatchAddress(value);
              setWatchAddressError(null);
              setWatchAddressSaved(false);
            }}
          />
          {watchAddressError ? (
            <Text className="mt-2 text-[11.5px] leading-[16px] text-[#ef9292]">
              {watchAddressError}
            </Text>
          ) : null}
          {watchAddressSaved ? (
            <Text className="mt-2 text-[11.5px] leading-[16px] text-success">
              {t('account.watchAddressSaved')}
            </Text>
          ) : null}
          <PrimaryButton
            className="mt-4"
            variant="secondary"
            disabled={savingWatchAddress}
            onPress={() => void saveWatchAddress()}
          >
            {t('account.watchAddressSave')}
          </PrimaryButton>
          {watchAddress.trim() ? (
            <Tap
              className="mt-3 min-h-9 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel={t('account.watchAddressClear')}
              onPress={clearWatchAddress}
            >
              <Text className="font-sans-semibold text-[12px] text-ink-dim">
                {t('account.watchAddressClear')}
              </Text>
            </Tap>
          ) : null}
        </Card>

        <Card className="mt-4 p-5">
          <Text className="font-sans-semibold text-[15px] text-ink">
            {t('account.webFeaturesTitle')}
          </Text>
          <Text className="mt-1 text-[12.5px] leading-5 text-ink-dim">
            {t('account.webFeaturesBody')}
          </Text>
        </Card>

        <PrimaryButton
          className="mt-5"
          variant="secondary"
          onPress={() => void logout()}
        >
          {t('account.signOut')}
        </PrimaryButton>
      </View>
    </ScreenScrollView>
  );
}
