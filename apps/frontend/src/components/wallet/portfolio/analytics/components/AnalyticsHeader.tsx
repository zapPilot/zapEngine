/**
 * Analytics Header Component
 *
 * Header section for analytics view with wallet filter selector
 */

import { AlertCircle, Download, Loader2, TrendingUp } from "lucide-react";
import type { ReactElement } from "react";

import type { WalletFilter, WalletOption } from "@/types/analytics";

import { WalletFilterSelector } from "./WalletFilterSelector";

export interface AnalyticsHeaderProps {
  /** Export handler function */
  onExport: () => void;
  /** Whether export is in progress */
  isExporting?: boolean;
  /** Export error message */
  exportError?: string | null;
  /** Currently selected wallet filter */
  selectedWallet: WalletFilter;
  /** Available wallet options */
  availableWallets: WalletOption[];
  /** Wallet selection change handler */
  onWalletChange: (wallet: WalletFilter) => void;
  /** Whether to show wallet selector (hide for single-wallet users) */
  showWalletSelector: boolean;
}

/**
 * Analytics Header
 *
 * Displays the analytics section title with wallet filter selector and export functionality.
 */
export function AnalyticsHeader({
  onExport,
  isExporting = false,
  exportError = null,
  selectedWallet,
  availableWallets,
  onWalletChange,
  showWalletSelector,
}: AnalyticsHeaderProps): ReactElement {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      {/* Title section */}
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-purple-400" />
            Flight Recorder
          </h2>
        </div>
        <p className="text-sm text-gray-400">
          Performance analysis and historical regime data
        </p>
      </div>

      {/* Controls section */}
      <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
        {/* Wallet filter selector (conditionally rendered) */}
        {showWalletSelector && (
          <WalletFilterSelector
            selectedWallet={selectedWallet}
            availableWallets={availableWallets}
            onChange={onWalletChange}
          />
        )}

        {/* Export button and error */}
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={onExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-300 bg-gray-800/50 hover:bg-gray-800 rounded-lg transition-colors border border-gray-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            {isExporting ? "Exporting..." : "Export Report"}
          </button>

          {exportError && (
            <div className="flex items-center gap-1 text-xs text-red-400">
              <AlertCircle className="w-3 h-3" />
              <span>{exportError}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
