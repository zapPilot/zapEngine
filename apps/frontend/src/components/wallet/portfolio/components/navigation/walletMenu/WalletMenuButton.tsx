import { WALLET_LABELS } from '@zapengine/app-core/constants/wallet';
import { formatAddress } from '@zapengine/app-core/utils/formatters';
import { ChevronDown, Wallet } from 'lucide-react';
import { type ReactElement } from 'react';

import type { WalletMenuButtonProps } from './types';
import {
  getChevronClassName,
  getMenuButtonClassName,
} from './walletMenuClassNames';

export function WalletMenuButton({
  accountAddress,
  isConnected,
  isConnecting,
  isMenuOpen,
  onConnectClick,
  onToggleMenu,
}: WalletMenuButtonProps): ReactElement {
  const showConnectedAddress = isConnected && Boolean(accountAddress);

  function handleButtonClick(): void {
    if (!isConnected) {
      onConnectClick();
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
      aria-expanded={isConnected ? isMenuOpen : false}
      aria-haspopup={isConnected ? 'menu' : 'dialog'}
    >
      <Wallet className="w-4 h-4 text-purple-400" />
      {!isConnected && (
        <span className="hidden sm:inline">
          {WALLET_LABELS.CREATE_ZAP_WALLET}
        </span>
      )}
      {showConnectedAddress && accountAddress && (
        <span className="font-mono hidden sm:inline">
          {formatAddress(accountAddress)}
        </span>
      )}
      <ChevronDown className={getChevronClassName(isConnected && isMenuOpen)} />
    </button>
  );
}
