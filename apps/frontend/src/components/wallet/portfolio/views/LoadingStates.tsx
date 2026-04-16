/**
 * Loading and Error State Components for Wallet Portfolio Layout
 *
 * Provides skeleton loading states, error displays, and demo mode banners
 * that match the wallet portfolio design system (glass morphism, purple gradients).
 */

import type { ReactNode } from "react";

function IconCircle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`w-16 h-16 rounded-full flex items-center justify-center ${className ?? ""}`.trim()}
    >
      {children}
    </div>
  );
}

function StatusIconCircle({
  className,
  svgClassName,
  pathD,
}: {
  className: string;
  svgClassName: string;
  pathD: string;
}) {
  return (
    <IconCircle className={className}>
      <svg
        className={svgClassName}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d={pathD}
        />
      </svg>
    </IconCircle>
  );
}

/**
 * Error State Component
 *
 * Displays user-friendly error message with retry button.
 * Follows portfolio design patterns for error states.
 */
export function WalletPortfolioErrorState({
  error,
  onRetry,
}: {
  error: Error | null;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4 px-4">
      {/* Error icon */}
      <StatusIconCircle
        className="bg-red-500/10 border border-red-500/30"
        svgClassName="w-8 h-8 text-red-400"
        pathD="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />

      {/* Error message */}
      <div className="text-red-400 text-lg font-medium">
        Failed to load portfolio data
      </div>

      {error && (
        <div className="text-gray-400 text-sm max-w-md text-center">
          {error.message}
        </div>
      )}

      {/* Retry button */}
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-6 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors duration-200 text-white font-medium"
        >
          Retry
        </button>
      )}
    </div>
  );
}
