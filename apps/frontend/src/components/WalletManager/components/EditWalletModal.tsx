import { X } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactElement,
  useEffect,
  useState,
} from "react";

import { BaseCard, GradientButton, LoadingSpinner } from "@/components/ui";
import { ModalBackdrop } from "@/components/ui/modal";
import type { WalletData } from "@/lib/validation/walletUtils";
import { formatAddress } from "@/utils/formatters";

import type { EditingWallet, WalletOperations } from "../types/wallet.types";

interface EditWalletModalProps {
  editingWallet: EditingWallet | null;
  wallets: WalletData[];
  operations: WalletOperations;
  onSave: (walletId: string, newLabel: string) => void;
  onClose: () => void;
}

export function EditWalletModal({
  editingWallet,
  wallets,
  operations,
  onSave,
  onClose,
}: EditWalletModalProps): ReactElement | null {
  const [newLabel, setNewLabel] = useState("");

  // Update newLabel when editingWallet changes
  useEffect(() => {
    if (editingWallet) {
      setNewLabel(editingWallet.label);
    }
  }, [editingWallet]);

  if (!editingWallet) return null;

  const handleSave = () => {
    onSave(editingWallet.id, newLabel);
  };

  const handleClose = () => {
    onClose();
    setNewLabel("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") handleSave();
    if (event.key === "Escape") handleClose();
  };

  const wallet = wallets.find(w => w.id === editingWallet.id);
  const isLoading = operations.editing[editingWallet.id]?.isLoading;

  return (
    <ModalBackdrop onDismiss={handleClose} innerClassName="w-full max-w-md">
      <BaseCard variant="glass" className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">Edit Wallet Label</h3>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <p className="text-sm text-gray-400 mb-4">
          Update the display name for{" "}
          {wallet ? formatAddress(wallet.address) : ""}
        </p>

        <div className="space-y-4">
          <input
            type="text"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder="Enter wallet label"
            className="w-full bg-gray-800/50 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-purple-500 outline-none"
            autoFocus
            onKeyDown={handleKeyDown}
          />

          <div className="flex gap-3">
            <GradientButton
              onClick={handleSave}
              gradient="from-green-600 to-emerald-600"
              className="flex-1"
              disabled={!newLabel.trim() || Boolean(isLoading)}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <LoadingSpinner size="sm" color="white" />
                  <span>Saving...</span>
                </div>
              ) : (
                "Save Changes"
              )}
            </GradientButton>
            <button
              onClick={handleClose}
              className="px-4 py-2 glass-morphism rounded-lg hover:bg-white/10 transition-colors text-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      </BaseCard>
    </ModalBackdrop>
  );
}
