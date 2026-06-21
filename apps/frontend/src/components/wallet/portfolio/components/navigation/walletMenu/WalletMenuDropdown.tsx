import { motion } from 'framer-motion';
import { type ReactElement } from 'react';

import { dropdownMenu } from '@/lib/ui/animationVariants';

import type { WalletMenuDropdownProps, WalletSectionCopyProps } from './types';
import { WalletSingleWalletSection } from './WalletMenuSections';

export function WalletMenuDropdown({
  accountAddress,
  copiedAddress,
  isConnected,
  isMenuOpen,
  onCloseMenu,
  onCopyAddress,
  onDisconnect,
  onOpenSettings,
  onOpenWalletManager,
}: WalletMenuDropdownProps): ReactElement | null {
  if (!isMenuOpen || !isConnected) {
    return null;
  }

  const sharedSectionProps: WalletSectionCopyProps = {
    copiedAddress,
    onCopyAddress,
    onOpenWalletManager,
    onOpenSettings,
    onCloseMenu,
    onDisconnect,
  };

  return (
    <motion.div
      data-testid="unified-wallet-menu-dropdown"
      variants={dropdownMenu}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="absolute top-full right-0 mt-2 w-80 bg-gray-900 border border-purple-500/30 rounded-xl shadow-2xl shadow-purple-500/10 backdrop-blur-xl z-50 overflow-hidden"
      role="menu"
      aria-label="Wallet menu"
    >
      {Boolean(accountAddress) && accountAddress && (
        <WalletSingleWalletSection
          accountAddress={accountAddress}
          {...sharedSectionProps}
        />
      )}
    </motion.div>
  );
}
