import { Check, Copy, LogOut, Settings, Wallet } from 'lucide-react';
import { type ReactElement } from 'react';

import { formatAddress } from '@/utils/formatters';

import type {
  CopyAddressButtonProps,
  DisconnectButtonProps,
  WalletMenuItemsProps,
  WalletSectionFooterProps,
  WalletSingleWalletSectionProps,
} from './types';
import { getCopyButtonClassName } from './walletMenuClassNames';

const MENU_ITEM_CLASS_NAME =
  'w-full px-4 py-2.5 text-left text-sm text-gray-200 hover:bg-purple-500/10 hover:text-white transition-colors flex items-center gap-3';

function CopyAddressButton({
  address,
  copiedAddress,
  onCopyAddress,
  variant = 'text',
}: CopyAddressButtonProps): ReactElement {
  const isCopied = copiedAddress === address;

  return (
    <button
      onClick={() => {
        onCopyAddress(address);
      }}
      className={getCopyButtonClassName(variant)}
    >
      {isCopied ? (
        <>
          <Check className="w-3 h-3" />
          {variant === 'text' && 'Copied'}
        </>
      ) : (
        <>
          <Copy className="w-3 h-3" />
          {variant === 'text' && 'Copy'}
        </>
      )}
    </button>
  );
}

function WalletMenuItems({
  onOpenWalletManager,
  onOpenSettings,
  onCloseMenu,
}: WalletMenuItemsProps): ReactElement {
  function handleOpenWalletManager(): void {
    onCloseMenu();
    onOpenWalletManager?.();
  }

  function handleOpenSettings(): void {
    onCloseMenu();
    onOpenSettings();
  }

  return (
    <>
      {onOpenWalletManager && (
        <button
          onClick={handleOpenWalletManager}
          className={MENU_ITEM_CLASS_NAME}
        >
          <Wallet className="w-4 h-4 text-purple-400" />
          View Bundles
        </button>
      )}
      <button onClick={handleOpenSettings} className={MENU_ITEM_CLASS_NAME}>
        <Settings className="w-4 h-4 text-purple-400" />
        Settings
      </button>
    </>
  );
}

function DisconnectButton({
  label,
  onDisconnect,
}: DisconnectButtonProps): ReactElement {
  return (
    <div className="border-t border-gray-800 py-1">
      <button
        onClick={onDisconnect}
        className="w-full px-4 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors flex items-center gap-3"
      >
        <LogOut className="w-4 h-4" />
        {label}
      </button>
    </div>
  );
}

function WalletSectionFooter({
  disconnectLabel,
  onCloseMenu,
  onDisconnect,
  onOpenSettings,
  onOpenWalletManager,
}: WalletSectionFooterProps): ReactElement {
  return (
    <>
      <div className="py-1">
        <WalletMenuItems
          onOpenWalletManager={onOpenWalletManager}
          onOpenSettings={onOpenSettings}
          onCloseMenu={onCloseMenu}
        />
      </div>
      <DisconnectButton label={disconnectLabel} onDisconnect={onDisconnect} />
    </>
  );
}

export function WalletSingleWalletSection({
  accountAddress,
  copiedAddress,
  onCopyAddress,
  onOpenWalletManager,
  onOpenSettings,
  onCloseMenu,
  onDisconnect,
}: WalletSingleWalletSectionProps): ReactElement {
  return (
    <div className="py-2">
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400 uppercase tracking-wide">
            Connected Wallet
          </span>
          <CopyAddressButton
            address={accountAddress}
            copiedAddress={copiedAddress}
            onCopyAddress={onCopyAddress}
            variant="text"
          />
        </div>
        <div className="font-mono text-sm text-white">
          {formatAddress(accountAddress)}
        </div>
      </div>

      <WalletSectionFooter
        onOpenWalletManager={onOpenWalletManager}
        onOpenSettings={onOpenSettings}
        onCloseMenu={onCloseMenu}
        onDisconnect={onDisconnect}
        disconnectLabel="Disconnect"
      />
    </div>
  );
}
