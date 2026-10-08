import { Icon } from '@/components/ui/Icon';
import type { WalletConnectorOption } from '@zapengine/app-core/types';
import { QrCode } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { CONNECT_SHEET_COPY } from '@/components/connect/connectCopy';
import { PrivyLoginOption } from '@/components/connect/PrivyLoginOption';
import { WalletOptionList } from '@/components/connect/WalletOptionList';
import { Sheet } from '@/components/ui/Sheet';
import { Callout } from '@/components/ui/Callout';
import { SectionHeader } from '@/components/ui/SectionHeader';

export interface ConnectSheetProps {
  visible: boolean;
  onClose: () => void;
  options: WalletConnectorOption[];
  connectingId: string | null;
  isConnecting: boolean;
  errorCopy: { title: string; body: string } | null;
  onPrivyPress: () => void;
  onWalletPress: (option: WalletConnectorOption) => void;
}

/**
 * Custom "choose how to connect" bottom sheet — absolute-positioned overlay
 * (mirrors ToastProvider/ContentLanguageSelector; no sheet library exists in
 * this app). Presentational only: takes discovered wallets and the connect
 * actions via props, so it stays previewable without importing wagmi/Privy.
 */
export function ConnectSheet({
  visible,
  onClose,
  options,
  connectingId,
  isConnecting,
  errorCopy,
  onPrivyPress,
  onWalletPress,
}: ConnectSheetProps) {
  const isBusy = isConnecting || connectingId !== null;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={CONNECT_SHEET_COPY.title}
      closeLabel={CONNECT_SHEET_COPY.closeLabel}
      dismissible={!isBusy}
    >
      <SectionHeader title={CONNECT_SHEET_COPY.eyebrow} />
      <Text className="mt-2 font-text text-caption leading-5 text-ink-2">
        {CONNECT_SHEET_COPY.subtitle}
      </Text>

      {errorCopy ? (
        <Callout
          tone="alert"
          className="mt-4"
          title={errorCopy.title}
          body={errorCopy.body}
        />
      ) : null}

      <View className="mt-4">
        <PrivyLoginOption
          isConnecting={connectingId === 'privy'}
          disabled={isBusy}
          onPress={onPrivyPress}
        />
      </View>

      <View className="my-4 flex-row items-center gap-3">
        <View className="h-px flex-1 bg-rule" />
        <SectionHeader title={CONNECT_SHEET_COPY.divider} />
        <View className="h-px flex-1 bg-rule" />
      </View>

      {options.length > 0 ? (
        <View className="mb-2">
          <SectionHeader title={CONNECT_SHEET_COPY.recommendedLabel} />
          <WalletOptionList
            options={options}
            connectingId={connectingId}
            isBusy={isBusy}
            onWalletPress={onWalletPress}
          />
        </View>
      ) : (
        <View className="flex-row items-center gap-3 rounded-panel border border-rule bg-well px-4 py-4">
          <View className="h-9 w-9 items-center justify-center rounded-panel border border-rule bg-well">
            <Icon icon={QrCode} size="md" tone="muted" />
          </View>
          <View className="flex-1">
            <Text className="font-text-semibold text-body-sm text-ink">
              {CONNECT_SHEET_COPY.emptyTitle}
            </Text>
            <Text className="mt-0.5 font-text text-label leading-4 text-ink-2">
              {CONNECT_SHEET_COPY.emptyBody}
            </Text>
          </View>
        </View>
      )}

      <View className="mt-4 flex-row items-center gap-2 border-t border-rule pt-3">
        <Text className="font-text text-label text-ink-3">
          {CONNECT_SHEET_COPY.footer}
        </Text>
      </View>
    </Sheet>
  );
}
