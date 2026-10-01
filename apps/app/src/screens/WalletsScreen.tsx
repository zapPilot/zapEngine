import { useToast } from '@zapengine/app-core/providers/ToastContext';
import * as Clipboard from 'expo-clipboard';
import { ArrowLeft, Wallet } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AddWalletForm } from '@/components/wallets/AddWalletForm';
import { WalletListSkeleton } from '@/components/wallets/WalletListStates';
import { WalletRow } from '@/components/wallets/WalletRow';
import { ListGroup } from '@/components/ui/ListGroup';
import { EmptyState } from '@/components/ui/EmptyState';
import { ListRow } from '@/components/ui/ListRow';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { useAccount } from '@/integration/useAccount';
import { useWalletManager } from '@/integration/useWalletManager';
import { toWalletRows } from '@/integration/walletManagerModel';
import { truncateAddress } from '@/lib/format';

export function WalletsScreen() {
  const router = useRouter();
  const { t } = useContentLanguage();
  const account = useAccount();
  const manager = useWalletManager(account.userId, account.address);
  const { showToast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);

  const rows = toWalletRows(manager.wallets, account.address);
  const showListSkeleton = manager.isRefreshing && rows.length === 0;

  const copyAddress = (address: string) => {
    void Clipboard.setStringAsync(address).then(() =>
      showToast({ type: 'success', title: 'Address copied' }),
    );
  };

  return (
    <ScreenScrollView width="narrow">
      <PageHeader
        title="Wallets"
        leading={
          <IconButton
            icon={ArrowLeft}
            accessibilityLabel={t('common.back')}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/account');
            }}
          />
        }
      />

      <View className="px-5 pt-5">
        <ListGroup className="p-5">
          <Text className="font-sans-semibold text-[15px] text-ink">
            {account.email || truncateAddress(account.address ?? '')}
          </Text>
          <View className="mt-3">
            <ListRow title="Wallets in bundle" value={String(rows.length)} />
          </View>
        </ListGroup>

        <View className="mt-5 flex-row items-center justify-between">
          <SectionHeader title={<> Bundled wallets </>} />
          {manager.isRefreshing && rows.length > 0 ? (
            <Text className="font-mono text-[9.5px] uppercase tracking-[0.76px] text-ink-faint">
              Refreshing
            </Text>
          ) : null}
        </View>
        <ListGroup className="mt-2 p-[13px]">
          {showListSkeleton ? (
            <WalletListSkeleton />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No wallets in this bundle"
              body="Wallets you add appear here and feed the combined portfolio."
              action={{
                label: 'Refresh',
                accessibilityLabel: 'Refresh wallet list',
                onPress: () => void manager.reload(),
              }}
            />
          ) : (
            rows.map((row, index) => (
              <WalletRow
                key={row.id}
                row={row}
                divider={index < rows.length - 1}
                isRemoving={Boolean(manager.removing[row.id]?.isLoading)}
                removeError={manager.removing[row.id]?.error ?? null}
                editError={manager.editing[row.id]?.error ?? null}
                isVerifying={Boolean(manager.verifying[row.address]?.isLoading)}
                verifyError={manager.verifying[row.address]?.error ?? null}
                onCopy={copyAddress}
                onSaveLabel={(walletId, newLabel) =>
                  void manager.saveLabel(walletId, newLabel)
                }
                onDelete={(walletId) => void manager.deleteWallet(walletId)}
                onVerify={(walletAddress) =>
                  void manager.verifyWallet(walletAddress)
                }
              />
            ))
          )}
        </ListGroup>

        <View className="mt-5">
          {showAddForm ? (
            <ListGroup className="p-4">
              <Text className="mb-3 font-sans-semibold text-[14px] text-ink">
                Add wallet to bundle
              </Text>
              <AddWalletForm
                busy={manager.addingState.isLoading}
                onSubmit={manager.addWallet}
                onDone={() => {
                  setShowAddForm(false);
                  showToast({ type: 'success', title: 'Wallet added' });
                }}
                onCancel={() => setShowAddForm(false)}
              />
            </ListGroup>
          ) : (
            <Button variant="secondary" onPress={() => setShowAddForm(true)}>
              Add wallet
            </Button>
          )}
        </View>

        <Text className="mt-3 text-[11.5px] leading-[17px] text-ink-faint">
          Bundle membership and ownership proof are separate. Added wallets stay
          unverified until you use Verify and sign with that wallet.
        </Text>
      </View>
    </ScreenScrollView>
  );
}
