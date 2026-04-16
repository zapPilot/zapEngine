import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { type ChangeEvent, type ReactElement } from "react";

import { GradientButton, LoadingSpinner } from "@/components/ui";
import { ANIMATIONS, GRADIENTS } from "@/constants/design-system";

import type { NewWallet, WalletOperations } from "../types/wallet.types";

interface AddWalletFormProps {
  isAdding: boolean;
  newWallet: NewWallet;
  operations: WalletOperations;
  validationError: string | null;
  onWalletChange: (wallet: Partial<NewWallet>) => void;
  onAddWallet: () => void;
  onCancel: () => void;
  onStartAdding: () => void;
}

export function AddWalletForm({
  isAdding,
  newWallet,
  operations,
  validationError,
  onWalletChange,
  onAddWallet,
  onCancel,
  onStartAdding,
}: AddWalletFormProps): ReactElement {
  const handleLabelChange = (event: ChangeEvent<HTMLInputElement>) => {
    onWalletChange({ label: event.target.value });
  };

  const handleAddressChange = (event: ChangeEvent<HTMLInputElement>) => {
    onWalletChange({ address: event.target.value });
  };

  if (isAdding) {
    return (
      <motion.div
        {...ANIMATIONS.EXPAND_COLLAPSE}
        className="p-4 glass-morphism rounded-xl mb-4"
      >
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Wallet Label (e.g., Trading Wallet)"
            value={newWallet.label}
            onChange={handleLabelChange}
            className="w-full bg-gray-800/50 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-purple-500 outline-none"
          />
          <input
            type="text"
            placeholder="Wallet Address (0x...)"
            value={newWallet.address}
            onChange={handleAddressChange}
            className="w-full bg-gray-800/50 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-purple-500 outline-none font-mono text-sm"
          />

          {/* Show validation error */}
          {validationError && (
            <div className="p-2 bg-red-600/10 border border-red-600/20 rounded-lg mb-3">
              <p className="text-xs text-red-300">{validationError}</p>
            </div>
          )}

          {/* Show add operation error */}
          {operations.adding.error && (
            <div className="p-2 bg-red-600/10 border border-red-600/20 rounded-lg mb-3">
              <p className="text-xs text-red-300">{operations.adding.error}</p>
            </div>
          )}

          <div className="flex space-x-2">
            <GradientButton
              onClick={onAddWallet}
              gradient="from-green-600 to-emerald-600"
              className="flex-1"
              disabled={operations.adding.isLoading}
            >
              {operations.adding.isLoading ? (
                <div className="flex items-center space-x-2">
                  <LoadingSpinner size="sm" color="white" />
                  <span>Adding...</span>
                </div>
              ) : (
                "Add to Bundle"
              )}
            </GradientButton>
            <button
              onClick={onCancel}
              className="px-4 py-2 glass-morphism rounded-lg hover:bg-white/10 transition-colors text-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <GradientButton
      onClick={onStartAdding}
      gradient={GRADIENTS.PRIMARY}
      icon={Plus}
      className="w-full"
    >
      Add Another Wallet
    </GradientButton>
  );
}
