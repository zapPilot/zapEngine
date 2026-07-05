import { Check } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { InfoRow } from '@/components/ui/InfoRow';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { NonCustodialCard } from '@/components/ui/NonCustodialCard';
import { Tap } from '@/components/ui/Tap';
import { CONTENT_LANGUAGE_OPTIONS } from '@/config/contentLanguages';
import { DEMO } from '@/data/demo';
import { useAccount } from '@/integration/useAccount';
import { cn } from '@/lib/cn';
import { truncateAddress } from '@/lib/format';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

export function AccountScreen() {
  const account = useAccount();
  const { languageCode, setLanguageCode } = useContentLanguage();
  const address = account.address ?? DEMO.account.address;
  const walletCount = account.walletAddresses.length || 1;

  return (
    <ScreenScrollView>
      <ScreenHeader title="Account" />
      <View className="px-5 pt-5">
        <Card className="p-5">
          <Text className="font-sans-semibold text-[15px] text-ink">
            {account.email || DEMO.account.label}
          </Text>
          <Text className="mt-2 font-mono text-[13px] text-accent">
            {truncateAddress(address)}
          </Text>
          <View className="mt-4">
            <InfoRow
              label="Mode"
              value={account.isConnected ? 'Live' : 'Demo'}
              divider
            />
            <InfoRow label="Wallets" value={String(walletCount)} divider />
            <InfoRow label="Runtime" value="Expo" />
          </View>
        </Card>
        <Card className="mt-4 p-5">
          <Text className="font-sans-semibold text-[15px] text-ink">
            Content language
          </Text>
          <Text className="mt-1 text-[12.5px] leading-5 text-ink-dim">
            Affects podcast episodes and audio versions. Listening history is
            preserved.
          </Text>
          <View className="mt-3">
            {CONTENT_LANGUAGE_OPTIONS.map((option, index) => {
              const selected = option.code === languageCode;
              return (
                <Tap
                  key={option.code}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setLanguageCode(option.code)}
                  className={cn(
                    'flex-row items-center justify-between py-[11px]',
                    index < CONTENT_LANGUAGE_OPTIONS.length - 1 &&
                      'border-b border-line',
                  )}
                >
                  <View className="flex-row items-center">
                    <View
                      className={cn(
                        'h-8 w-8 items-center justify-center rounded-lg border',
                        selected
                          ? 'border-[rgba(212,197,163,.3)] bg-[rgba(212,197,163,.12)]'
                          : 'border-line bg-[rgba(255,255,255,.045)]',
                      )}
                    >
                      <Text
                        className={cn(
                          'font-mono text-[11px]',
                          selected ? 'text-accent' : 'text-ink',
                        )}
                      >
                        {option.badge}
                      </Text>
                    </View>
                    <Text className="ml-3 text-[13px] text-ink">
                      {option.nativeName}
                    </Text>
                  </View>
                  {selected ? (
                    <Check size={16} strokeWidth={2} color="#d4c5a3" />
                  ) : null}
                </Tap>
              );
            })}
          </View>
        </Card>
        <View className="mt-4">
          <NonCustodialCard
            title="You approve every transaction"
            body="Zap Pilot can prepare routes, but the wallet backend must sign before anything moves."
          />
        </View>
        <PrimaryButton
          className="mt-5"
          variant={account.isConnected ? 'secondary' : 'primary'}
          onPress={() => {
            if (account.isConnected) {
              void account.disconnect();
            } else {
              void account.connect();
            }
          }}
        >
          {account.isConnected ? 'Disconnect wallet' : 'Connect wallet'}
        </PrimaryButton>
      </View>
    </ScreenScrollView>
  );
}
