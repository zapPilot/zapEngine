/**
 * Analytics Error State Component
 *
 * Error state for analytics view with retry functionality
 */

import { Info } from "lucide-react";
import type { ReactElement } from "react";

/**
 * Analytics Error State Props
 */
interface AnalyticsErrorStateProps {
  /** Error object (may be null) */
  error: Error | null;
  /** Retry callback */
  onRetry: () => void;
}

/**
 * Analytics Error State
 *
 * Displays a user-friendly error message with retry button.
 */
export function AnalyticsErrorState({
  error,
  onRetry,
}: AnalyticsErrorStateProps): ReactElement {
  return (
    <div className="flex flex-col items-center justify-center p-12 min-h-[400px]">
      <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
        <Info className="w-8 h-8 text-red-400" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">
        Failed to Load Analytics Data
      </h3>
      <p className="text-sm text-gray-400 mb-6 text-center max-w-md">
        {error?.message || "Unable to fetch analytics data. Please try again."}
      </p>
      <button
        onClick={onRetry}
        className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
      >
        Retry
      </button>
    </div>
  );
}
