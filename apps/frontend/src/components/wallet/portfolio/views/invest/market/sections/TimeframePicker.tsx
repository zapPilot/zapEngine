import type { JSX } from "react";

import { type Timeframe, TIMEFRAMES } from "./marketDashboardConstants";

interface TimeframePickerProps {
  value: Timeframe;
  onChange: (tf: Timeframe) => void;
  testIdPrefix: string;
  keyPrefix?: string;
  borderColor?: string;
  activeColor?: string;
  buttonSize?: string;
}

/**
 * TimeframePicker component for selecting timeframe ranges.
 * Reusable button group that maps over TIMEFRAMES.
 * @param value - Current selected timeframe
 * @param onChange - Callback when timeframe changes
 * @param testIdPrefix - Prefix for test IDs (e.g., "btc-tf-" or "ratio-tf-")
 * @param keyPrefix - Prefix for React keys (defaults to empty string)
 * @param borderColor - Tailwind border color class (defaults to "border-gray-700")
 * @param activeColor - Tailwind background color when active (defaults to "bg-purple-600")
 * @param buttonSize - Tailwind size classes (defaults to "px-4 py-1.5 text-sm")
 */
export function TimeframePicker({
  value,
  onChange,
  testIdPrefix,
  keyPrefix = "",
  borderColor = "border-gray-700",
  activeColor = "bg-purple-600",
  buttonSize = "px-4 py-1.5 text-sm",
}: TimeframePickerProps): JSX.Element {
  return (
    <div
      className={`flex items-center gap-1 bg-gray-800 rounded-lg p-1 border ${borderColor}`}
    >
      {TIMEFRAMES.map(tf => (
        <button
          key={`${keyPrefix}${tf.id}`}
          onClick={() => onChange(tf.id)}
          data-testid={`${testIdPrefix}${tf.id}`}
          className={`${buttonSize} font-medium rounded-md transition-colors ${
            value === tf.id
              ? `${activeColor} text-white shadow-sm`
              : "text-gray-400 hover:text-gray-200 hover:bg-gray-700/50"
          }`}
        >
          {tf.id}
        </button>
      ))}
    </div>
  );
}
