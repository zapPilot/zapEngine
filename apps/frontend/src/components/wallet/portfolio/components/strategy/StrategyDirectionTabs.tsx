import type { Regime } from "@/components/wallet/regime/regimeData";
import {
  getStrategyTabLabel,
  type StrategyDirection,
} from "@/components/wallet/regime/strategyLabels";

interface StrategyDirectionTabsProps {
  regime: Regime;
  activeDirection: StrategyDirection;
  onSelectDirection: (direction: StrategyDirection) => void;
}

/**
 * StrategyDirectionTabs - Switcher for directional strategy views
 *
 * Displays tabs for "fromLeft" and "fromRight" strategies when a regime
 * has multiple strategic approaches based on market direction.
 */
export function StrategyDirectionTabs({
  regime,
  activeDirection,
  onSelectDirection,
}: StrategyDirectionTabsProps) {
  // Only show tabs if we have multiple strategies (not just default)
  const availableDirections = (
    Object.keys(regime.strategies) as (keyof typeof regime.strategies)[]
  ).filter(k => k !== "default");

  if (availableDirections.length === 0) {
    return null;
  }

  return (
    <div className="flex gap-2 mb-2 overflow-x-auto">
      {(["fromLeft", "fromRight"] as const).map(direction => {
        if (!regime.strategies[direction]) return null;

        const isSelected = activeDirection === direction;
        const label = getStrategyTabLabel(regime.id, direction);

        return (
          <button
            key={direction}
            onClick={e => {
              e.stopPropagation();
              onSelectDirection(direction);
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-300 cursor-pointer border ${
              isSelected
                ? `bg-gradient-to-r ${regime.visual.gradient} text-white border-transparent shadow-lg`
                : "bg-gray-800/50 text-gray-400 border-gray-700 hover:bg-gray-800 hover:text-gray-300"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
