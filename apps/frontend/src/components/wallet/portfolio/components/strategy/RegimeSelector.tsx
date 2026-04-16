import type { Regime } from "@/components/wallet/regime/regimeData";

interface RegimeSelectorProps {
  currentRegime: Regime | undefined;
  selectedRegime: Regime | undefined;
  onSelectRegime: (regimeId: string) => void;
  regimes: Regime[];
}

const STYLES = {
  regimeButtonSelected:
    "bg-gray-800 border border-gray-600 shadow-lg scale-102 ring-1 ring-purple-500/50",
  regimeButtonUnselected: "opacity-60 hover:opacity-100 hover:bg-gray-800/50",
} as const;

/**
 * RegimeSelector - Displays market cycle regime spectrum with selection
 *
 * Shows all available regimes with visual indicators for:
 * - Current regime (animated pulse)
 * - Selected regime (highlighted)
 * - Regime selection state
 */
export function RegimeSelector({
  currentRegime,
  selectedRegime,
  onSelectRegime,
  regimes,
}: RegimeSelectorProps) {
  return (
    <div
      data-testid="regime-spectrum"
      data-interactive="true"
      className="flex flex-col"
    >
      <h4 className="text-sm font-bold text-white mb-4">
        Market Cycle Position
      </h4>
      <div className="flex flex-col gap-2">
        {regimes.map(regime => {
          const isCurrent = currentRegime?.id === regime.id;
          const isSelected = selectedRegime?.id === regime.id;

          return (
            <button
              key={regime.id}
              onClick={e => {
                e.stopPropagation();
                onSelectRegime(regime.id);
              }}
              className={`flex items-center gap-3 p-2 rounded-lg transition-all w-full text-left cursor-pointer ${
                isSelected
                  ? STYLES.regimeButtonSelected
                  : STYLES.regimeButtonUnselected
              }`}
            >
              <div
                className={`w-3 h-3 rounded-full ${isCurrent ? "animate-pulse" : ""}`}
                style={{
                  backgroundColor: regime.fillColor,
                }}
              />
              <span
                className={`text-sm font-bold ${isSelected ? "text-white" : "text-gray-400"}`}
              >
                {regime.label}
              </span>
              {isCurrent && (
                <span className="ml-auto text-xs font-mono text-gray-400">
                  Current
                </span>
              )}
              {!isCurrent && isSelected && (
                <span className="ml-auto text-xs font-mono text-purple-400">
                  Viewing
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
