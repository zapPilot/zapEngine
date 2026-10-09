import { Link } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Tap } from '@/components/ui/Tap';
import { useFundFlow } from '@/providers/FundFlowProvider';
import { requestAccountConnection } from '@/integration/requestAccountConnection';
import { WALLET_PARTS } from '@/integration/runtimeStatusModel';
import { CapabilityRow } from './CapabilityRow';
import { View } from 'react-native';
import { Wallet } from 'lucide-react-native';
import { useUserWallets } from '@zapengine/app-core/hooks/queries/wallet/useUserWallets';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Badge } from '@/components/ui/Badge';
import { Callout } from '@/components/ui/Callout';
import { EmptyState } from '@/components/ui/EmptyState';
import { HomeWalletSearch } from '@/components/home/HomeWalletSearch';
import { AssetRow, AssetListSkeleton } from '@/components/home/AssetRow';
import { DEMO } from '@/data/demo';
import { useAccount } from '@/integration/useAccount';
import {
  normalizeWalletAddressList,
  useWalletAssets,
} from '@/integration/walletTokens';
import { formatOr, formatUsd } from '@/lib/format';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
/** Public lookup and cached asset rows share the selected bundle subject. */
export function RuntimeWalletSection() {
  const { t } = useContentLanguage();
  const account = useAccount();
  const fund = useFundFlow();
  const wallets = useUserWallets(
    account.isOwnBundle ? null : account.viewingUserId,
  );
  const addresses = normalizeWalletAddressList(
    account.isOwnBundle
      ? account.walletAddresses
      : (wallets.data?.map((wallet) => wallet.wallet) ?? []),
  );
  const balances = useWalletAssets(addresses);
  const assets = account.isDemo ? DEMO.home.assets : balances.assets;
  const total = account.isDemo
    ? assets.reduce((sum, asset) => sum + (asset.usdValue ?? 0), 0)
    : balances.totalUsdValue;
  const retry = () => {
    void balances.refetch();
    if (!account.isOwnBundle) void wallets.refetch();
  };
  return (
    <View className="gap-4 pb-5">
      <Text variant="heading">{t('runtime.wallet')}</Text>
      <HomeWalletSearch />
      <Card padding="md" className="gap-3">
        <View className="flex-row items-center justify-between">
          <Text variant="heading">{t('home.walletAssets')}</Text>
          {account.isDemo ? (
            <Badge tone="secondary">{t('today.demo')}</Badge>
          ) : null}
        </View>
        {!account.isDemo && (balances.isLoading || wallets.isLoading) ? (
          <AssetListSkeleton />
        ) : !account.isDemo && (balances.isError || wallets.isError) ? (
          <Callout
            tone="alert"
            title={t('home.assetsErrorTitle')}
            body={t('home.assetsErrorBody')}
            action={{ label: t('common.retry'), onPress: retry }}
          />
        ) : (
          <>
            {!account.isDemo && balances.failedChains.length > 0 ? (
              <Callout
                tone="neutral"
                body={t('home.assetsPartialBody')}
                action={{ label: t('common.retry'), onPress: retry }}
              />
            ) : null}
            {assets.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title={t('home.assetsEmptyTitle')}
                body={t('home.assetsEmptyBody')}
              />
            ) : (
              assets.map((asset, index) => (
                <AssetRow
                  key={asset.symbol}
                  asset={asset}
                  divider={index < assets.length - 1}
                />
              ))
            )}
          </>
        )}
        <View className="flex-row justify-between border-t border-rule pt-3">
          <Text variant="caption" tone="muted">
            {t('home.assetsIdleAcross', { count: addresses.length })}
          </Text>
          <Text variant="data">{formatOr(total, formatUsd)}</Text>
        </View>
      </Card>
      <View className="flex-row flex-wrap gap-3">
        <Link href="/portfolio" asChild>
          <Tap accessibilityRole="link" className="min-h-hit justify-center">
            <Text variant="action" tone="sign">
              {t('home.viewPortfolio')}
            </Text>
          </Tap>
        </Link>
        <Button
          disabled={!account.isOwnBundle && !account.isDemo}
          onPress={() =>
            account.isConnected
              ? fund.open({ fresh: true })
              : requestAccountConnection(account)
          }
        >
          {t('fund.title')}
        </Button>
      </View>
      {WALLET_PARTS.map((id) => (
        <CapabilityRow key={id} id={id} />
      ))}
      <Link href="/wallets" asChild>
        <Tap accessibilityRole="link" className="min-h-hit justify-center">
          <Text variant="action" tone="sign">
            {t('account.manageWallets')}
          </Text>
        </Tap>
      </Link>
    </View>
  );
}
