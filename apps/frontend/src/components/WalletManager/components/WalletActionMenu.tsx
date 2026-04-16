import { Copy, Edit3, ExternalLink, MoreVertical, Trash2 } from "lucide-react";
import { memo, type ReactElement } from "react";

import { Portal } from "@/components/ui/Portal";
import { Z_INDEX } from "@/constants/design-system";
import type { WalletData } from "@/lib/validation/walletUtils";

import type {
  MenuPosition,
  WalletMenuHandlers,
  WalletOperations,
} from "../types/wallet.types";

interface WalletActionMenuProps extends WalletMenuHandlers {
  wallet: WalletData;
  isOpen: boolean;
  menuPosition: MenuPosition | null;
  operations: WalletOperations;
  isOwner: boolean;
}

function WalletActionMenuComponent(props: WalletActionMenuProps): ReactElement {
  const {
    wallet,
    isOpen,
    menuPosition,
    operations,
    isOwner,
    onCopyAddress,
    onEditWallet,
    onDeleteWallet,
    onToggleDropdown,
    onCloseDropdown,
  } = props;

  const handleToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onToggleDropdown(wallet.id, e.currentTarget);
  };

  const handleCopyAddress = () => {
    onCopyAddress(wallet.address, wallet.id);
    onCloseDropdown();
  };

  const handleEditWallet = () => {
    onEditWallet(wallet.id, wallet.label);
    onCloseDropdown();
  };

  const handleDeleteWallet = () => {
    onDeleteWallet(wallet.id);
    onCloseDropdown();
  };

  const handleViewOnDeBank = () => {
    onCloseDropdown();
  };

  return (
    <div className="relative">
      <button
        onClick={handleToggle}
        className="p-2 rounded-lg hover:bg-white/10 transition-colors"
        aria-label={`Actions for ${wallet.label}`}
      >
        <MoreVertical className="w-4 h-4 text-gray-400" />
      </button>

      {isOpen && menuPosition && (
        <Portal>
          <div
            className={`w-48 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl ${Z_INDEX.TOOLTIP}`}
            style={{
              position: "fixed",
              top: menuPosition.top,
              left: menuPosition.left,
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="py-1">
              <button
                onClick={handleCopyAddress}
                className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-white/10 transition-colors flex items-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Copy Address
              </button>
              <a
                href={`https://debank.com/profile/${wallet.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-white/10 transition-colors flex items-center gap-2"
                onClick={handleViewOnDeBank}
              >
                <ExternalLink className="w-4 h-4" />
                View on DeBank
              </a>
              {isOwner && (
                <>
                  <div className="border-t border-gray-700 my-1" />
                  <button
                    onClick={handleEditWallet}
                    className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-white/10 transition-colors flex items-center gap-2"
                  >
                    <Edit3 className="w-4 h-4" />
                    Edit Label
                  </button>
                  <button
                    onClick={handleDeleteWallet}
                    className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-600/20 transition-colors flex items-center gap-2"
                    disabled={operations.removing[wallet.id]?.isLoading}
                  >
                    <Trash2 className="w-4 h-4" />
                    Remove from Bundle
                  </button>
                </>
              )}
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}

export const WalletActionMenu = memo(WalletActionMenuComponent);

WalletActionMenu.displayName = "WalletActionMenu";
