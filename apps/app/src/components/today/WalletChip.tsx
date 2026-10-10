import { Link } from 'expo-router';
import { Tap } from '@/components/ui/Tap';
import { Text } from '@/components/ui/Text';
import { useAccount } from '@/integration/useAccount';
import { APP_ROUTES } from '@/integration/navigationModel';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
export function WalletChip() {
  const account = useAccount();
  const { t } = useContentLanguage();
  const label = account.isConnected
    ? (account.walletEntries.find(
        (entry) =>
          entry.address.toLowerCase() === account.address?.toLowerCase(),
      )?.label ?? t('today.mainWallet'))
    : t('today.demoWallet');
  return (
    <Link href={APP_ROUTES.wallet} asChild>
      <Tap
        accessibilityRole="link"
        accessibilityLabel={t('account.manageWallets')}
        className="rounded-round border border-sign-ink px-3 py-2"
      >
        <Text variant="label" tone="sign">
          {label}
        </Text>
      </Tap>
    </Link>
  );
}
