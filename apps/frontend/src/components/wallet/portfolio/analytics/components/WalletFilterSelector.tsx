/**
 * Wallet Filter Selector Component
 *
 * Dropdown selector for filtering analytics by wallet address.
 * Shows "All Wallets" (bundle aggregation) or individual wallet options.
 */

import { Check, ChevronDown, Wallet } from "lucide-react";
import { type ReactElement, useRef, useState } from "react";

import { useClickOutside } from "@/hooks/ui/useClickOutside";
import type { WalletFilter, WalletOption } from "@/types/analytics";
import { formatAddress } from "@/utils/formatters";

/**
 * Props for WalletFilterSelector component
 */
export interface WalletFilterSelectorProps {
  /** Currently selected wallet filter (null = All Wallets) */
  selectedWallet: WalletFilter;
  /** Available wallet options to select from */
  availableWallets: WalletOption[];
  /** Callback when wallet selection changes */
  onChange: (wallet: WalletFilter) => void;
  /** Whether data is currently loading */
  isLoading?: boolean;
}

/**
 * Wallet Filter Selector
 *
 * Dropdown menu for selecting between bundle-level analytics (All Wallets)
 * and individual wallet-specific analytics.
 *
 * Features:
 * - "All Wallets" option for bundle aggregation (default)
 * - Individual wallet options with addresses and labels
 * - Checkmark indicator for selected option
 * - Click-outside detection to close dropdown
 * - Keyboard navigation (Escape to close)
 * - Loading state support
 *
 * @example
 * ```tsx
 * <WalletFilterSelector
 *   selectedWallet={null}
 *   availableWallets={[
 *     { address: '0x1234...5678', label: 'Main Wallet' },
 *     { address: '0x5678...9ABC', label: null }
 *   ]}
 *   onChange={(wallet) => setSelectedWallet(wallet)}
 * />
 * ```
 */
export function WalletFilterSelector({
  selectedWallet,
  availableWallets,
  onChange,
  isLoading = false,
}: WalletFilterSelectorProps): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  let currentLabel = "All Wallets";
  if (selectedWallet !== null) {
    const selectedWalletLabel = availableWallets.find(
      wallet => wallet.address === selectedWallet
    )?.label;
    currentLabel = selectedWalletLabel || formatAddress(selectedWallet);
  }

  // Close dropdown when clicking outside or pressing Escape
  useClickOutside(dropdownRef, () => setIsOpen(false), isOpen);

  /**
   * Handle wallet selection
   */
  const handleSelect = (wallet: WalletFilter) => {
    onChange(wallet);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Dropdown trigger button */}
      <button
        onClick={() => setIsOpen(previous => !previous)}
        disabled={isLoading}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Filter by wallet"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <Wallet className="w-4 h-4 text-gray-400" aria-hidden="true" />
        <span className="text-gray-200">{currentLabel}</span>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className="absolute z-50 mt-2 w-64 bg-gray-900 border border-gray-700 rounded-lg shadow-xl max-h-80 overflow-y-auto"
          role="listbox"
          aria-label="Wallet filter options"
        >
          {/* "All Wallets" option */}
          <button
            onClick={() => handleSelect(null)}
            className={`w-full px-4 py-3 text-left hover:bg-gray-800 flex items-center justify-between transition-colors ${
              selectedWallet === null ? "bg-gray-800/50" : ""
            }`}
            role="option"
            aria-selected={selectedWallet === null}
          >
            <span className="text-gray-200 font-medium">All Wallets</span>
            {selectedWallet === null && (
              <Check className="w-4 h-4 text-purple-400" aria-hidden="true" />
            )}
          </button>

          {/* Divider */}
          <div className="border-t border-gray-800" role="separator" />

          {/* Individual wallet options */}
          {availableWallets.map(wallet => (
            <button
              key={wallet.address}
              onClick={() => handleSelect(wallet.address)}
              className={`w-full px-4 py-3 text-left hover:bg-gray-800 flex items-center justify-between gap-3 transition-colors ${
                selectedWallet === wallet.address ? "bg-gray-800/50" : ""
              }`}
              role="option"
              aria-selected={selectedWallet === wallet.address}
            >
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-gray-200 font-mono text-xs truncate">
                  {formatAddress(wallet.address)}
                </span>
                {wallet.label && (
                  <span className="text-gray-400 text-xs truncate">
                    {wallet.label}
                  </span>
                )}
              </div>
              {selectedWallet === wallet.address && (
                <Check
                  className="w-4 h-4 text-purple-400 flex-shrink-0"
                  aria-hidden="true"
                />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
