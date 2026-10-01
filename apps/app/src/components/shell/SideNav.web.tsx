import { Link, usePathname } from 'expo-router';
import { LockKeyhole } from 'lucide-react-native';
import { View } from 'react-native';
import { BrandLockup } from '@/components/ui/BrandLockup';
import { Icon } from '@/components/ui/Icon';
import { Tap } from '@/components/ui/Tap';
import { Text } from '@/components/ui/Text';
import { activeAppTabForPathname } from '@/integration/navigationModel';
import { requestAccountConnection } from '@/integration/requestAccountConnection';
import { useAccount } from '@/integration/useAccount';
import { truncateAddress } from '@/lib/format';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { cn } from '@/lib/cn';
import { useAppTabs } from './useAppTabs';
import { NowPlayingBarHost } from './NowPlayingBarHost';
export function SideNav() {
  const { tabs, access } = useAppTabs();
  const account = useAccount();
  const { t } = useContentLanguage();
  const active = activeAppTabForPathname(usePathname());
  return (
    <View
      role="navigation"
      accessibilityLabel={t('common.primaryNavigation')}
      className="w-sidenav shrink-0 border-r border-line bg-surface px-4 py-8"
    >
      <BrandLockup />
      <View className="mt-8 gap-2">
        {tabs.map((tab) => {
          const content = (
            <>
              <Icon
                icon={tab.icon}
                tone={active === tab.name ? 'accent' : 'muted'}
              />
              <Text
                variant="label"
                tone={active === tab.name ? 'accent' : 'secondary'}
                className="flex-1"
              >
                {tab.label}
              </Text>
              {!tab.accessible ? (
                <Icon icon={LockKeyhole} size="xs" tone="muted" />
              ) : null}
            </>
          );
          const classes = cn(
            'min-h-hit flex-row items-center gap-3 rounded-control px-3 py-3',
            active === tab.name && 'bg-accent-soft',
          );
          return tab.accessible ? (
            <Link key={tab.name} href={tab.href} dismissTo asChild>
              <Tap
                feedback="highlight"
                accessibilityRole="link"
                accessibilityLabel={tab.label}
                aria-current={active === tab.name ? 'page' : undefined}
                className={classes}
              >
                {content}
              </Tap>
            </Link>
          ) : (
            <Tap
              accessibilityRole="button"
              key={tab.name}
              feedback="highlight"
              accessibilityLabel={tab.label}
              accessibilityHint={tab.hint}
              onPress={() => requestAccountConnection(access)}
              className={classes}
            >
              {content}
            </Tap>
          );
        })}
      </View>
      <View className="mt-auto gap-4 pt-8">
        <NowPlayingBarHost layout="card" />
        {account.isConnected ? (
          <Link href="/account" dismissTo asChild>
            <Tap
              accessibilityRole="link"
              accessibilityLabel={t('tabs.account')}
              feedback="highlight"
              className="min-h-hit rounded-control px-3 py-3"
            >
              <Text variant="body-sm" numberOfLines={1}>
                {account.email ??
                  (account.address
                    ? truncateAddress(account.address)
                    : t('tabs.account'))}
              </Text>
            </Tap>
          </Link>
        ) : (
          <Tap
            accessibilityRole="button"
            accessibilityLabel={t('common.signIn')}
            onPress={() => requestAccountConnection(access)}
            feedback="highlight"
            className="min-h-hit justify-center rounded-control border border-line-hi px-3"
          >
            <Text variant="label">{t('common.signIn')}</Text>
          </Tap>
        )}
      </View>
    </View>
  );
}
