export interface ConnectedWalletItem {
  address: string;
  isActive?: boolean;
}

export type CopyButtonVariant = "text" | "icon-only";

export interface CopyAddressButtonProps {
  address: string;
  copiedAddress: string | null;
  onCopyAddress: (address: string) => void;
  variant?: CopyButtonVariant;
}

export interface WalletMenuItemsProps {
  onOpenWalletManager: (() => void) | undefined;
  onOpenSettings: () => void;
  onCloseMenu: () => void;
}

export interface DisconnectButtonProps {
  label: string;
  onDisconnect: () => void;
}

export interface WalletSectionActionsProps extends WalletMenuItemsProps {
  onDisconnect: () => void;
}

export interface WalletSectionFooterProps extends WalletSectionActionsProps {
  disconnectLabel: string;
}

export interface WalletMenuButtonProps {
  isConnected: boolean;
  isConnecting: boolean;
  isMenuOpen: boolean;
  accountAddress: string | undefined;
  hasMultipleWallets: boolean;
  connectedWalletCount: number;
  onConnectClick: () => Promise<void>;
  onToggleMenu: () => void;
}

export interface WalletSectionCopyProps extends WalletSectionActionsProps {
  copiedAddress: string | null;
  onCopyAddress: (address: string) => void;
}

export interface WalletSingleWalletSectionProps extends WalletSectionCopyProps {
  accountAddress: string;
}

export interface WalletMultipleWalletSectionProps extends WalletSectionCopyProps {
  connectedWallets: ConnectedWalletItem[];
}

export interface WalletMenuDropdownProps extends WalletSectionCopyProps {
  isConnected: boolean;
  isMenuOpen: boolean;
  hasMultipleWallets: boolean;
  accountAddress: string | undefined;
  connectedWallets: ConnectedWalletItem[];
}
