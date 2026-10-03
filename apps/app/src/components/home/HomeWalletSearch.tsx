import { ArrowRight, Search, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { TextField } from '@/components/ui/TextField';
import { useAccount } from '@/integration/useAccount';
import { useWalletSearch } from '@/integration/useWalletSearch';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

export function HomeWalletSearch() {
  const account = useAccount();
  const { t } = useContentLanguage();
  const [input, setInput] = useState('');
  const { state, search, clear } = useWalletSearch(
    account.userId,
    account.walletAddresses,
  );
  const submit = () => {
    void search(input);
  };
  const error =
    state === 'invalid' || state === 'notFound' || state === 'error'
      ? t(
          state === 'invalid'
            ? 'home.searchInvalid'
            : state === 'notFound'
              ? 'home.searchNotFound'
              : 'home.searchError',
        )
      : undefined;
  return (
    <View className="px-5 pt-3">
      <TextField
        label={t('home.searchWallet')}
        placeholder={t('home.searchWallet')}
        value={input}
        onChangeText={setInput}
        onSubmitEditing={submit}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        {...(error ? { error } : {})}
        prefix={<Icon icon={Search} tone="muted" />}
        suffix={
          <View className="flex-row items-center gap-2">
            {input || account.bundleView ? (
              <IconButton
                icon={X}
                variant="ghost"
                accessibilityLabel={t('home.clearWalletSearch')}
                onPress={() => {
                  setInput('');
                  clear();
                }}
              />
            ) : null}
            {state === 'loading' ? (
              <ActivityIndicator size="small" />
            ) : (
              <IconButton
                icon={ArrowRight}
                tone="accent"
                variant="ghost"
                accessibilityLabel={t('home.searchSubmit')}
                onPress={submit}
              />
            )}
          </View>
        }
      />
    </View>
  );
}
