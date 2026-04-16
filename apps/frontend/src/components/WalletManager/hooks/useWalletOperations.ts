import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useState,
} from "react";

import { useAccountDeletion } from "@/hooks/wallet/useAccountDeletion";
import { useWalletLabels } from "@/hooks/wallet/useWalletLabels";
import { useWalletList } from "@/hooks/wallet/useWalletList";
import { useWalletMutations } from "@/hooks/wallet/useWalletMutations";
import {
  handleWalletError,
  type WalletData,
} from "@/lib/validation/walletUtils";
import { useToast } from "@/providers/ToastProvider";
import { useWalletProvider } from "@/providers/WalletProvider";
import { copyTextToClipboard } from "@/utils/clipboard";
import { formatAddress } from "@/utils/formatters";

import type {
  EditingWallet,
  NewWallet,
  WalletOperations,
} from "../types/wallet.types";

const EMPTY_CONNECTED_WALLETS: WalletData[] = [];

interface UseWalletOperationsParams {
  viewingUserId: string;
  realUserId: string;
  isOwner: boolean;
  isOpen: boolean;
}

interface UseWalletOperationsReturn {
  wallets: ReturnType<typeof useWalletList>["wallets"];
  operations: WalletOperations;
  isRefreshing: ReturnType<typeof useWalletList>["isRefreshing"];
  isAdding: boolean;
  editingWallet: EditingWallet | null;
  newWallet: NewWallet;
  validationError: string | null;
  isDeletingAccount: ReturnType<typeof useAccountDeletion>["isDeletingAccount"];
  setIsAdding: Dispatch<SetStateAction<boolean>>;
  setEditingWallet: Dispatch<SetStateAction<EditingWallet | null>>;
  setNewWallet: Dispatch<SetStateAction<NewWallet>>;
  setValidationError: Dispatch<SetStateAction<string | null>>;
  loadWallets: ReturnType<typeof useWalletList>["loadWallets"];
  handleDeleteWallet: ReturnType<
    typeof useWalletMutations
  >["handleDeleteWallet"];
  handleEditLabel: ReturnType<typeof useWalletLabels>["handleEditLabel"];
  handleAddWallet: () => Promise<void>;
  handleCopyAddress: (address: string) => Promise<void>;
  handleDeleteAccount: ReturnType<
    typeof useAccountDeletion
  >["handleDeleteAccount"];
  handleSwitchWallet: (walletAddress: string) => Promise<void>;
}

/**
 * Facade hook that orchestrates wallet management operations
 *
 * Composes smaller, focused hooks for better maintainability:
 * - useWalletList: Loading and polling
 * - useWalletMutations: Add/delete operations
 * - useWalletLabels: Label editing
 * - useAccountDeletion: Account deletion
 *
 * Maintains backward compatibility with existing component interface.
 */
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

  // Local state
  const [operations, setOperations] = useState<WalletOperations>({
    adding: { isLoading: false, error: null },
    removing: {},
    editing: {},
    subscribing: { isLoading: false, error: null },
  });
  const [isAdding, setIsAdding] = useState(false);
  const [editingWallet, setEditingWallet] = useState<EditingWallet | null>(
    null
  );
  const [newWallet, setNewWallet] = useState<NewWallet>({
    address: "",
    label: "",
  });
  const [validationError, setValidationError] = useState<string | null>(null);

  const setWalletOperationState = useCallback(
    (
      key: "removing" | "editing",
      walletId: string,
      state: { isLoading: boolean; error: string | null }
    ) => {
      setOperations(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          [walletId]: state,
        },
      }));
    },
    []
  );

  // Compose focused hooks
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

  const accountDeletion = useAccountDeletion({
    userId: realUserId,
  });

  // Handle adding new wallet with UI state management
  const handleAddWallet = useCallback(async () => {
    const result = await walletMutations.handleAddWallet(newWallet);

    if (result.success) {
      // Reset form and close adding mode
      setIsAdding(false);
      setNewWallet({ address: "", label: "" });
      setValidationError(null);
    } else if (result.error) {
      setValidationError(result.error);
    }
  }, [walletMutations, newWallet]);

  // Handle copy to clipboard
  const handleCopyAddress = useCallback(
    async (address: string) => {
      const success = await copyTextToClipboard(address);
      if (success) {
        showToast({
          type: "success",
          title: "Address Copied",
          message: `${formatAddress(address)} copied to clipboard`,
        });
      }
    },
    [showToast]
  );

  // Handle wallet switching (V22 Phase 2B)
  const handleSwitchWallet = useCallback(
    async (walletAddress: string) => {
      try {
        await switchActiveWallet(walletAddress);

        showToast({
          type: "success",
          title: "Wallet Switched",
          message: `Active wallet changed to ${formatAddress(walletAddress)}`,
        });

        // Reload wallets to update active state
        await walletList.loadWallets(true);
      } catch (error) {
        const errorMessage = handleWalletError(error);
        showToast({
          type: "error",
          title: "Switch Failed",
          message: errorMessage,
        });
      }
    },
    [switchActiveWallet, showToast, walletList]
  );

  return {
    // State
    wallets: walletList.wallets,
    operations,
    isRefreshing: walletList.isRefreshing,
    isAdding,
    editingWallet,
    newWallet,
    validationError,
    isDeletingAccount: accountDeletion.isDeletingAccount,

    // Actions
    setIsAdding,
    setEditingWallet,
    setNewWallet,
    setValidationError,
    loadWallets: walletList.loadWallets,
    handleDeleteWallet: walletMutations.handleDeleteWallet,
    handleEditLabel: walletLabels.handleEditLabel,
    handleAddWallet,
    handleCopyAddress,
    handleDeleteAccount: accountDeletion.handleDeleteAccount,
    handleSwitchWallet,
  };
}
