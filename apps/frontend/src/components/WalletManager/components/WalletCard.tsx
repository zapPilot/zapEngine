import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { memo } from "react";

import { LoadingSpinner } from "@/components/ui";
import { fadeInUp, SMOOTH_TRANSITION } from "@/lib/ui/animationVariants";
import type { WalletData } from "@/lib/validation/walletUtils";
import { formatAddress } from "@/utils/formatters";

import type {
  WalletMenuHandlers,
  WalletOperations,
} from "../types/wallet.types";
import { WalletActionMenu } from "./WalletActionMenu";

interface WalletCardProps extends WalletMenuHandlers {
  wallet: WalletData;
  operations: WalletOperations;
  isOwner: boolean;
  openDropdown: string | null;
  menuPosition: { top: number; left: number } | null;
}

interface OperationStatusProps {
  isLoading?: boolean;
  label: string;
}

function OperationStatus({ isLoading, label }: OperationStatusProps) {
  if (!isLoading) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-sm text-gray-400">
      <LoadingSpinner size="sm" />
      <span className="hidden sm:inline">{label}</span>
    </div>
  );
}

function getWalletCardClassName(isActive: boolean): string {
  const baseClassName =
    "relative p-4 rounded-xl border transition-all duration-200";
  if (isActive) {
    return `${baseClassName} border-purple-500/50 bg-purple-500/10 shadow-lg shadow-purple-500/20`;
  }

  return `${baseClassName} glass-morphism border-gray-700 hover:border-gray-600`;
}

function getWalletOperationError(
  operations: WalletOperations,
  walletId: string
): string | undefined {
  const removeError = operations.removing[walletId]?.error ?? undefined;
  const editError = operations.editing[walletId]?.error ?? undefined;
  return removeError || editError;
}

function WalletCardComponent({
  wallet,
  operations,
  isOwner,
  onCopyAddress,
  onEditWallet,
  onDeleteWallet,
  openDropdown,
  menuPosition,
  onToggleDropdown,
  onCloseDropdown,
}: WalletCardProps) {
  const operationError = getWalletOperationError(operations, wallet.id);

  return (
    <motion.div
      key={wallet.id}
      layout
      {...fadeInUp}
      transition={SMOOTH_TRANSITION}
      className={getWalletCardClassName(wallet.isActive)}
      role="article"
      aria-label={`Wallet ${wallet.label}`}
    >
      {wallet.isActive && (
        <div className="absolute top-2 right-2">
          <span
            className="px-2 py-1 bg-purple-500 text-white text-xs font-bold rounded-full flex items-center gap-1"
            role="status"
            aria-label="Active wallet"
          >
            <Zap className="w-3 h-3" aria-hidden="true" /> Active
          </span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-white truncate">
              {wallet.label}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <code className="font-mono text-xs sm:text-sm truncate">
              {formatAddress(wallet.address)}
            </code>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <OperationStatus
            isLoading={Boolean(operations.editing[wallet.id]?.isLoading)}
            label="Updating..."
          />
          <OperationStatus
            isLoading={Boolean(operations.removing[wallet.id]?.isLoading)}
            label="Removing..."
          />
          <WalletActionMenu
            wallet={wallet}
            isOpen={openDropdown === wallet.id}
            menuPosition={menuPosition}
            operations={operations}
            isOwner={isOwner}
            onCopyAddress={onCopyAddress}
            onEditWallet={onEditWallet}
            onDeleteWallet={onDeleteWallet}
            onToggleDropdown={onToggleDropdown}
            onCloseDropdown={onCloseDropdown}
          />
        </div>
      </div>

      {operationError && (
        <div className="mt-3 p-2 bg-red-600/10 border border-red-600/20 rounded-lg">
          <p className="text-xs text-red-300">{operationError}</p>
        </div>
      )}
    </motion.div>
  );
}

export const WalletCard = memo(WalletCardComponent);

WalletCard.displayName = "WalletCard";
