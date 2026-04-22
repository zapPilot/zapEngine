import { AnimatePresence } from "framer-motion";
import { AlertTriangle, Wallet, X } from "lucide-react";
import { memo, type ReactElement, useCallback } from "react";

import { BaseCard } from "@/components/ui";
import { Skeleton } from "@/components/ui/LoadingSystem";
import { ModalBackdrop } from "@/components/ui/modal";
import { GRADIENTS } from "@/constants/design-system";
import { useUser } from "@/contexts/UserContext";
import { useAsyncRetryButton } from "@/hooks/ui/useAsyncRetryButton";
import type { WalletManagerProps } from "@/types";
import { logger } from "@/utils";

import { DeleteAccountButton } from "./components/DeleteAccountButton";
import { EditWalletModal } from "./components/EditWalletModal";
import { EmailSubscription } from "./components/EmailSubscription";
import { WalletList } from "./components/WalletList";
import { WalletListProvider } from "./contexts/WalletListContext";
import { useDropdownMenu } from "./hooks/useDropdownMenu";
import { useEmailSubscription } from "./hooks/useEmailSubscription";
import { useWalletOperations } from "./hooks/useWalletOperations";
import {
  getWalletDescription,
  getWalletManagerIdentity,
} from "./walletManagerUtils";

type WalletOperationsState = ReturnType<typeof useWalletOperations>;
type EmailSubscriptionState = ReturnType<typeof useEmailSubscription>;
type DropdownMenuState = ReturnType<typeof useDropdownMenu>;

function isWalletManagerBusy(loading: boolean, isRefreshing: boolean): boolean {
  return loading || isRefreshing;
}

interface WalletManagerHeaderProps {
  isConnected: boolean;
  isOwner: boolean;
  onClose: () => void;
}

function WalletManagerHeader({
  isConnected,
  isOwner,
  onClose,
}: WalletManagerHeaderProps): ReactElement {
  return (
    <div className="flex items-center justify-between p-6 border-b border-gray-700/50">
      <div className="flex items-center space-x-3">
        <div
          className={`w-10 h-10 rounded-xl bg-gradient-to-r ${GRADIENTS.PRIMARY} flex items-center justify-center`}
        >
          <Wallet className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2
            id="wallet-manager-title"
            className="text-xl font-bold text-white"
          >
            Bundled Wallets
          </h2>
          <p id="wallet-manager-description" className="text-sm text-gray-400">
            {getWalletDescription(isConnected, isOwner)}
          </p>
        </div>
      </div>
      <button
        onClick={onClose}
        className="p-2 rounded-xl glass-morphism hover:bg-white/10 transition-all duration-200"
        aria-label="Close wallet manager"
      >
        <X className="w-5 h-5 text-gray-300" />
      </button>
    </div>
  );
}

function WalletManagerLoadingState({
  isRefreshing,
}: WalletManagerLoadingStateProps): ReactElement {
  return (
    <div className="p-6 text-center">
      <div className="flex justify-center mb-3">
        <Skeleton
          variant="rectangular"
          width="8rem"
          height={32}
          aria-label="Loading wallet data"
          data-testid="unified-loading"
        />
      </div>
      <p className="text-gray-400 text-sm">
        {isRefreshing ? "Refreshing wallets..." : "Loading bundled wallets..."}
      </p>
    </div>
  );
}

interface WalletManagerLoadingStateProps {
  isRefreshing: boolean;
}

interface WalletManagerErrorStateProps {
  error: string;
  onRetry: () => void;
  isRetrying: boolean;
}

function WalletManagerErrorState({
  error,
  onRetry,
  isRetrying,
}: WalletManagerErrorStateProps): ReactElement {
  return (
    <div className="p-6 text-center">
      <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-3" />
      <p className="text-red-400 text-sm mb-3">{error}</p>
      <button
        onClick={onRetry}
        disabled={isRetrying}
        className="px-3 py-1 text-xs bg-red-600/20 text-red-300 rounded-lg hover:bg-red-600/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isRetrying ? "Retrying..." : "Retry"}
      </button>
    </div>
  );
}

interface WalletManagerContentProps {
  isOwner: boolean;
  walletSectionProps: WalletManagerSectionProps;
}

interface WalletManagerSectionProps {
  walletOperations: WalletOperationsState;
  emailSubscription: EmailSubscriptionState;
  dropdownMenu: DropdownMenuState;
  onWalletChange: (
    changes: Partial<WalletOperationsState["newWallet"]>
  ) => void;
  onEditWallet: (walletId: string, label: string) => void;
  onCancelAdding: () => void;
}

function WalletManagerContent({
  isOwner,
  walletSectionProps,
}: WalletManagerContentProps): ReactElement {
  const {
    walletOperations,
    emailSubscription,
    dropdownMenu,
    onWalletChange,
    onEditWallet,
    onCancelAdding,
  } = walletSectionProps;

  return (
    <>
      <WalletListProvider
        operations={walletOperations.operations}
        openDropdown={dropdownMenu.openDropdown}
        menuPosition={dropdownMenu.menuPosition}
        onCopyAddress={walletOperations.handleCopyAddress}
        onEditWallet={onEditWallet}
        onDeleteWallet={walletOperations.handleDeleteWallet}
        onToggleDropdown={dropdownMenu.toggleDropdown}
        onCloseDropdown={dropdownMenu.closeDropdown}
      >
        <WalletList
          wallets={walletOperations.wallets}
          isOwner={isOwner}
          isAdding={walletOperations.isAdding}
          newWallet={walletOperations.newWallet}
          validationError={walletOperations.validationError}
          onWalletChange={onWalletChange}
          onAddWallet={walletOperations.handleAddWallet}
          onStartAdding={() => walletOperations.setIsAdding(true)}
          onCancelAdding={onCancelAdding}
        />
      </WalletListProvider>

      {isOwner && (
        <EmailSubscription
          email={emailSubscription.email}
          subscribedEmail={emailSubscription.subscribedEmail}
          isEditingSubscription={emailSubscription.isEditingSubscription}
          subscriptionOperation={emailSubscription.subscriptionOperation}
          onEmailChange={emailSubscription.setEmail}
          onSubscribe={emailSubscription.handleSubscribe}
          onUnsubscribe={emailSubscription.handleUnsubscribe}
          onStartEditing={emailSubscription.startEditingSubscription}
          onCancelEditing={emailSubscription.cancelEditingSubscription}
        />
      )}

      {isOwner && (
        <div className="p-6">
          <DeleteAccountButton
            onDelete={walletOperations.handleDeleteAccount}
            isDeleting={walletOperations.isDeletingAccount}
          />
        </div>
      )}
    </>
  );
}

interface WalletManagerStateSectionsProps {
  isBusy: boolean;
  isRefreshing: boolean;
  error: string | null;
  handleRetry: () => void;
  isRetrying: boolean;
  showContent: boolean;
  isOwnerView: boolean;
  walletSectionProps: WalletManagerSectionProps;
}

function WalletManagerStateSections({
  isBusy,
  isRefreshing,
  error,
  handleRetry,
  isRetrying,
  showContent,
  isOwnerView,
  walletSectionProps,
}: WalletManagerStateSectionsProps): ReactElement {
  return (
    <>
      {isBusy && <WalletManagerLoadingState isRefreshing={isRefreshing} />}
      {error && (
        <WalletManagerErrorState
          error={error}
          onRetry={handleRetry}
          isRetrying={isRetrying}
        />
      )}
      {showContent && (
        <WalletManagerContent
          isOwner={isOwnerView}
          walletSectionProps={walletSectionProps}
        />
      )}
    </>
  );
}

function WalletManagerComponent({
  isOpen,
  onClose,
  urlUserId,
  onEmailSubscribed,
}: WalletManagerProps): ReactElement | null {
  const { userInfo, loading, error, isConnected, refetch } = useUser();
  const { realUserId, viewingUserId, isOwnerView } = getWalletManagerIdentity(
    urlUserId,
    userInfo?.userId
  );

  const walletOperations = useWalletOperations({
    viewingUserId,
    realUserId,
    isOwner: isOwnerView,
    isOpen,
  });

  const emailSubscription = useEmailSubscription({
    viewingUserId,
    realUserId,
    isOpen,
    onEmailSubscribed,
  });

  const dropdownMenu = useDropdownMenu();

  const { handleRetry, isRetrying } = useAsyncRetryButton({
    onRetry: async () => {
      await refetch();
    },
    errorContext: "refetch user data in WalletManager",
    logger,
  });

  // Handle wallet operations
  const handleWalletChange = useCallback(
    (changes: Partial<typeof walletOperations.newWallet>) => {
      walletOperations.setNewWallet(prev => ({ ...prev, ...changes }));
    },
    [walletOperations]
  );

  const handleEditWallet = useCallback(
    (walletId: string, label: string) => {
      walletOperations.setEditingWallet({ id: walletId, label });
    },
    [walletOperations]
  );

  const handleCancelAdding = useCallback(() => {
    walletOperations.setIsAdding(false);
    walletOperations.setNewWallet({ address: "", label: "" });
    walletOperations.setValidationError(null);
  }, [walletOperations]);

  const handleCloseEditModal = useCallback(() => {
    walletOperations.setEditingWallet(null);
  }, [walletOperations]);

  if (!isOpen) return null;

  const isBusy = isWalletManagerBusy(loading, walletOperations.isRefreshing);
  const showContent = !isBusy && !error;
  const walletSectionProps: WalletManagerSectionProps = {
    walletOperations,
    emailSubscription,
    dropdownMenu,
    onWalletChange: handleWalletChange,
    onEditWallet: handleEditWallet,
    onCancelAdding: handleCancelAdding,
  };

  return (
    <AnimatePresence>
      <ModalBackdrop
        onDismiss={onClose}
        innerClassName="w-full max-w-2xl max-h-[80vh] overflow-y-auto"
      >
        <BaseCard variant="glass" className="p-0 overflow-hidden">
          <WalletManagerHeader
            isConnected={isConnected}
            isOwner={isOwnerView}
            onClose={onClose}
          />
          <WalletManagerStateSections
            isBusy={isBusy}
            isRefreshing={walletOperations.isRefreshing}
            error={error}
            handleRetry={handleRetry}
            isRetrying={isRetrying}
            showContent={showContent}
            isOwnerView={isOwnerView}
            walletSectionProps={walletSectionProps}
          />
        </BaseCard>

        <EditWalletModal
          editingWallet={walletOperations.editingWallet}
          wallets={walletOperations.wallets}
          operations={walletOperations.operations}
          onSave={walletOperations.handleEditLabel}
          onClose={handleCloseEditModal}
        />
      </ModalBackdrop>
    </AnimatePresence>
  );
}

export const WalletManager = memo(WalletManagerComponent);
