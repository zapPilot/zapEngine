import { AlertTriangle, Trash2 } from "lucide-react";
import { type ReactElement, useState } from "react";

import { GradientButton } from "@/components/ui";
import { GRADIENTS } from "@/constants/design-system";

interface DeleteAccountButtonProps {
  onDelete: () => void;
  isDeleting: boolean;
}

export function DeleteAccountButton({
  onDelete,
  isDeleting,
}: DeleteAccountButtonProps): ReactElement {
  const [showConfirm, setShowConfirm] = useState(false);

  if (!showConfirm) {
    return (
      <button
        onClick={() => setShowConfirm(true)}
        className="w-full text-left p-4 border border-red-600/30 rounded-xl glass-morphism hover:bg-red-600/10 transition-all duration-200 cursor-pointer"
      >
        <div className="flex items-start space-x-3">
          <Trash2 className="w-5 h-5 text-red-400 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-red-400 mb-1">
              Delete Account
            </h4>
            <p className="text-xs text-gray-400">
              Permanently delete this account and all associated wallets. Use
              this if you accidentally created multiple accounts and want to
              consolidate them.
            </p>
          </div>
        </div>
      </button>
    );
  }

  return (
    <div className="p-4 border border-red-600/50 rounded-xl bg-red-600/5">
      <div className="flex items-start space-x-3 mb-4">
        <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
        <div>
          <h4 className="text-sm font-semibold text-red-400 mb-1">
            Confirm Account Deletion
          </h4>
          <p className="text-xs text-gray-300 mb-2">
            This will permanently delete this account. You cannot delete
            accounts with active subscriptions.
          </p>
        </div>
      </div>
      <div className="flex space-x-2">
        <GradientButton
          onClick={onDelete}
          gradient={GRADIENTS.DANGER}
          icon={Trash2}
          disabled={isDeleting}
          className="flex-1"
        >
          {isDeleting ? "Deleting..." : "Yes, Delete Account"}
        </GradientButton>
        <button
          onClick={() => setShowConfirm(false)}
          disabled={isDeleting}
          className="flex-1 px-4 py-2 rounded-xl glass-morphism hover:bg-white/10 transition-all duration-200 text-sm font-medium text-gray-300 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
