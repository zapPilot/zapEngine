export interface WalletManagerProps {
  isOpen: boolean;
  onClose: () => void;
  urlUserId?: string;
  onEmailSubscribed?: () => void;
}

// Local operation states
export interface OperationState {
  isLoading: boolean;
  error: string | null;
}

export type WalletOperationStateSetter = (
  key: "removing" | "editing",
  walletId: string,
  state: OperationState
) => void;

export interface WalletOperations {
  adding: OperationState;
  removing: Record<string, OperationState>;
  editing: Record<string, OperationState>;
  subscribing: OperationState;
}

export interface EditingWallet {
  id: string;
  label: string;
}

export interface NewWallet {
  address: string;
  label: string;
}

export interface MenuPosition {
  top: number;
  left: number;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export interface WalletMenuHandlers {
  onCopyAddress: (address: string, walletId: string) => void;
  onEditWallet: (walletId: string, label: string) => void;
  onDeleteWallet: (walletId: string) => void;
  onToggleDropdown: (walletId: string, element: HTMLElement) => void;
  onCloseDropdown: () => void;
}
