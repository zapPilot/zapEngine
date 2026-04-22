import { ChevronDown, Wallet } from 'lucide-react';
import { type ReactElement } from 'react';

import { WALLET_LABELS } from '@/constants/wallet';
import { formatAddress } from '@/utils/formatters';

import type { WalletMenuButtonProps } from './types';
import {
  getChevronClassName,
  getMenuButtonClassName,
} from './walletMenuClassNames';

export function WalletMenuButton({
  accountAddress,
  connectedWalletCount,
  hasMultipleWallets,
  isConnected,
  isConnecting,
  isMenuOpen,
  onConnectClick,
  onToggleMenu,
}: WalletMenuButtonProps): ReactElement {
  const showConnectedAddress = isConnected && Boolean(accountAddress);

  function handleButtonClick(): void {
    if (!isConnected) {
      void onConnectClick();
      return;
    }

    onToggleMenu();
  }

  return (
    <button
      data-testid="unified-wallet-menu-button"
      onClick={handleButtonClick}
      disabled={isConnecting}
      className={getMenuButtonClassName(isConnecting)}
      aria-expanded={isMenuOpen}
      aria-haspopup="menu"
    >
      <Wallet className="w-4 h-4 text-purple-400" />
      {!isConnected && (
        <span className="hidden sm:inline">{WALLET_LABELS.CONNECT}</span>
      )}
      {showConnectedAddress && accountAddress && (
        <>
          <span className="font-mono hidden sm:inline">
            {formatAddress(accountAddress)}
          </span>
          {hasMultipleWallets && (
            <span className="ml-1 px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded text-xs font-bold hidden sm:inline">
              {connectedWalletCount}
            </span>
          )}
        </>
      )}
      <ChevronDown className={getChevronClassName(isMenuOpen)} />
    </button>
  );
}
