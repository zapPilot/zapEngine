import { useToast } from '@zapengine/app-core/providers/ToastContext';
import { tokens } from '@zapengine/design-tokens/tokens';
import * as Clipboard from 'expo-clipboard';
import { Wallet } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AddWalletForm } from '@/components/wallets/AddWalletForm';
import { WalletListSkeleton } from '@/components/wallets/WalletListStates';
import { WalletRow } from '@/components/wallets/WalletRow';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { InfoRow } from '@/components/ui/InfoRow';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenBackButton } from '@/components/ui/ScreenBackButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { useAccount } from '@/integration/useAccount';
import { useWalletManager } from '@/integration/useWalletManager';
import { toWalletRows } from '@/integration/walletManagerModel';
import { truncateAddress } from '@/lib/format';

export function WalletsScreen() {
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
    <ScreenScrollView>
      <ScreenHeader
        title="Wallets"
        left={<ScreenBackButton fallbackHref="/account" />}
      />

      <View className="px-5 pt-5">
        <Card className="p-5">
          <Text className="font-sans-semibold text-[15px] text-ink">
            {account.email || truncateAddress(account.address ?? '')}
          </Text>
          <View className="mt-3">
            <InfoRow label="Wallets in bundle" value={String(rows.length)} />
          </View>
        </Card>

        <View className="mt-5 flex-row items-center justify-between">
          <SectionLabel>Bundled wallets</SectionLabel>
          {manager.isRefreshing && rows.length > 0 ? (
            <Text className="font-mono text-[9.5px] uppercase tracking-[0.76px] text-ink-faint">
              Refreshing
            </Text>
          ) : null}
        </View>
        <Card className="mt-2 p-[13px]">
          {showListSkeleton ? (
            <WalletListSkeleton />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={
                <Wallet
                  size={17}
                  strokeWidth={1.8}
                  color={tokens.color.accent}
                />
              }
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
        </Card>

        <View className="mt-5">
          {showAddForm ? (
            <Card className="p-4">
              <Text className="mb-3 font-sans-semibold text-[14px] text-ink">
                Add wallet to bundle
              </Text>
              <AddWalletForm
                busy={manager.addingState.isLoading}
                activeAddress={account.address}
                onConnectWallet={manager.connectWallet}
                onSubmit={manager.addWallet}
                onDone={() => {
                  setShowAddForm(false);
                  showToast({ type: 'success', title: 'Wallet added' });
                }}
                onCancel={() => setShowAddForm(false)}
              />
            </Card>
          ) : (
            <PrimaryButton
              variant="secondary"
              onPress={() => setShowAddForm(true)}
            >
              Add wallet
            </PrimaryButton>
          )}
        </View>

        <Text className="mt-3 text-[11.5px] leading-[17px] text-ink-faint">
          You can add a wallet before connecting it. Switch to that wallet and
          verify ownership before portfolio tracking begins.
        </Text>
      </View>
    </ScreenScrollView>
  );
}
