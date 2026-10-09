import { Link, usePathname } from 'expo-router';
import { View } from 'react-native';
import { BrandLockup } from '@/components/ui/BrandLockup';
import { Tap } from '@/components/ui/Tap';
import { Text } from '@/components/ui/Text';
import {
  APP_ROUTES,
  activeAppTabForPathname,
} from '@/integration/navigationModel';
import { requestAccountConnection } from '@/integration/requestAccountConnection';
import { useAccount } from '@/integration/useAccount';
import { truncateAddress } from '@/lib/format';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { cn } from '@/lib/cn';
import { useAppTabs } from './useAppTabs';
import { AppDock } from './AppDock';
import { TabGlyph } from './TabGlyph';
export function SideNav() {
  const { tabs } = useAppTabs();
  const account = useAccount();
  const { t } = useContentLanguage();
  const active = activeAppTabForPathname(usePathname());
  return (
    <View
      role="navigation"
      accessibilityLabel={t('common.primaryNavigation')}
      className="w-sidenav shrink-0 border-r border-rule bg-sheet px-4 py-8"
    >
      <BrandLockup />
      <View className="mt-8 gap-2">
        {tabs.map((tab) => {
          const content = (
            <>
              <TabGlyph name={tab.name} active={active === tab.name} />
              <Text
                variant="label"
                tone={active === tab.name ? 'default' : 'secondary'}
                className="flex-1"
              >
                {tab.label}
              </Text>
            </>
          );
          const classes = cn(
            'min-h-hit flex-row items-center gap-3 rounded-control px-3 py-3',
            active === tab.name && 'bg-well',
          );
          return (
            <Link key={tab.name} href={tab.href} asChild>
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
          );
        })}
      </View>
      <View className="mt-auto gap-4 pt-8">
        <AppDock layout="card" />
        {account.isConnected ? (
          <Link href={APP_ROUTES.wallet} asChild>
            <Tap
              accessibilityRole="link"
              accessibilityLabel={t('account.manageWallets')}
              feedback="highlight"
              className="min-h-hit rounded-control px-3 py-3"
            >
              <Text variant="body-sm" numberOfLines={1}>
                {account.address
                  ? truncateAddress(account.address)
                  : (account.email ?? t('account.manageWallets'))}
              </Text>
            </Tap>
          </Link>
        ) : (
          <Tap
            accessibilityRole="button"
            accessibilityLabel={t('common.signIn')}
            onPress={() => requestAccountConnection(account)}
            feedback="highlight"
            className="min-h-hit justify-center rounded-control border border-rule-2 px-3"
          >
            <Text variant="label">{t('common.signIn')}</Text>
          </Tap>
        )}
      </View>
    </View>
  );
}
