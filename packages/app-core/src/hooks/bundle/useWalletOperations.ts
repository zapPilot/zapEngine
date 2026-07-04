import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useState,
} from 'react';

import {
  handleWalletError,
  type WalletData,
} from '../../lib/validation/walletUtils';
import { useToast } from '../../providers/ToastContext';
import { useWalletProvider } from '../../providers/WalletProvider';
import type { EditingWallet, NewWallet, WalletOperations } from '../../types';
import { formatAddress } from '../../utils/formatters';
import { useWalletLabels } from '../wallet/useWalletLabels';
import { useWalletList } from '../wallet/useWalletList';
import { useWalletMutations } from '../wallet/useWalletMutations';

const EMPTY_CONNECTED_WALLETS: WalletData[] = [];

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    const clipboard = globalThis.navigator?.clipboard;
    if (!clipboard?.writeText) {
      return false;
    }

    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

interface UseWalletOperationsParams {
  viewingUserId: string;
  realUserId: string;
  isOwner: boolean;
  isOpen: boolean;
}

interface UseWalletOperationsReturn {
  wallets: ReturnType<typeof useWalletList>['wallets'];
  operations: WalletOperations;
  isRefreshing: ReturnType<typeof useWalletList>['isRefreshing'];
  isAdding: boolean;
  editingWallet: EditingWallet | null;
  newWallet: NewWallet;
  validationError: string | null;
  isDeletingAccount: boolean;
  setIsAdding: Dispatch<SetStateAction<boolean>>;
  setEditingWallet: Dispatch<SetStateAction<EditingWallet | null>>;
  setNewWallet: Dispatch<SetStateAction<NewWallet>>;
  setValidationError: Dispatch<SetStateAction<string | null>>;
  loadWallets: ReturnType<typeof useWalletList>['loadWallets'];
  handleDeleteWallet: ReturnType<
    typeof useWalletMutations
  >['handleDeleteWallet'];
  handleEditLabel: ReturnType<typeof useWalletLabels>['handleEditLabel'];
  handleAddWallet: () => Promise<void>;
  handleCopyAddress: (address: string) => Promise<void>;
  handleDeleteAccount: () => Promise<void>;
  handleSwitchWallet: (walletAddress: string) => Promise<void>;
}

export function useWalletOperations({
  viewingUserId,
  realUserId,
  isOwner,
  isOpen,
}: UseWalletOperationsParams): UseWalletOperationsReturn {
  const { showToast } = useToast();
  const {
    connectedWallets = EMPTY_CONNECTED_WALLETS,
    switchActiveWallet = () => Promise.resolve(),
  } = useWalletProvider();
  const [operations, setOperations] = useState<WalletOperations>({
    adding: { isLoading: false, error: null },
    removing: {},
    editing: {},
    subscribing: { isLoading: false, error: null },
  });
  const [isAdding, setIsAdding] = useState(false);
  const [editingWallet, setEditingWallet] = useState<EditingWallet | null>(
    null,
  );
  const [newWallet, setNewWallet] = useState<NewWallet>({
    address: '',
    label: '',
  });
  const [validationError, setValidationError] = useState<string | null>(null);

  const setWalletOperationState = useCallback(
    (
      key: 'removing' | 'editing',
      walletId: string,
      state: { isLoading: boolean; error: string | null },
    ) => {
      setOperations((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          [walletId]: state,
        },
      }));
    },
    [],
  );

  const walletList = useWalletList({
    userId: viewingUserId,
    connectedWallets,
    isOpen,
    isOwner,
  });

  const walletMutations = useWalletMutations({
    userId: realUserId,
    operations,
    setOperations,
    setWallets: walletList.setWallets,
    setWalletOperationState,
    loadWallets: walletList.loadWallets,
  });

  const walletLabels = useWalletLabels({
    userId: realUserId,
    wallets: walletList.wallets,
    setWallets: walletList.setWallets,
    setEditingWallet,
    setWalletOperationState,
  });

  const handleDeleteAccount = useCallback(async () => {
    showToast({
      type: 'error',
      title: 'Account Deletion Unavailable',
      message: 'Account deletion is not available in this runtime.',
    });
  }, [showToast]);

  const handleAddWallet = useCallback(async () => {
    const result = await walletMutations.handleAddWallet(newWallet);

    if (result.success) {
      setIsAdding(false);
      setNewWallet({ address: '', label: '' });
      setValidationError(null);
    } else if (result.error) {
      setValidationError(result.error);
    }
  }, [walletMutations, newWallet]);

  const handleCopyAddress = useCallback(
    async (address: string) => {
      const success = await copyTextToClipboard(address);
      if (success) {
        showToast({
          type: 'success',
          title: 'Address Copied',
          message: `${formatAddress(address)} copied to clipboard`,
        });
      }
    },
    [showToast],
  );

  const handleSwitchWallet = useCallback(
    async (walletAddress: string) => {
      try {
        await switchActiveWallet(walletAddress);

        showToast({
          type: 'success',
          title: 'Wallet Switched',
          message: `Active wallet changed to ${formatAddress(walletAddress)}`,
        });

        await walletList.loadWallets(true);
      } catch (error) {
        const errorMessage = handleWalletError(error);
        showToast({
          type: 'error',
          title: 'Switch Failed',
          message: errorMessage,
        });
      }
    },
    [switchActiveWallet, showToast, walletList],
  );

  return {
    wallets: walletList.wallets,
    operations,
    isRefreshing: walletList.isRefreshing,
    isAdding,
    editingWallet,
    newWallet,
    validationError,
    isDeletingAccount: false,
    setIsAdding,
    setEditingWallet,
    setNewWallet,
    setValidationError,
    loadWallets: walletList.loadWallets,
    handleDeleteWallet: walletMutations.handleDeleteWallet,
    handleEditLabel: walletLabels.handleEditLabel,
    handleAddWallet,
    handleCopyAddress,
    handleDeleteAccount,
    handleSwitchWallet,
  };
}
