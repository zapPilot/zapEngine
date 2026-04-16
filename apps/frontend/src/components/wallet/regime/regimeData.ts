import { type LucideIcon, Pause, TrendingDown, TrendingUp } from "lucide-react";

import type { RegimeAllocationBreakdown } from "@/types/domain/allocation";

/**
 * Shared allocation states used across regime transitions.
 * Each state represents a unique portfolio composition in the flow.
 * Using shared objects ensures allocation consistency between connected regimes.
 * Internal constant used by regime strategies
 */
const ALLOCATION_STATES = {
  DEFENSIVE: { spot: 30, stable: 70 },
  BALANCED: { spot: 50, stable: 50 },
  ACCUMULATE: { spot: 70, stable: 30 },
  TAKE_PROFIT: { spot: 45, stable: 55 },
} as const satisfies Record<string, RegimeAllocationBreakdown>;

// Internal constant used by regime strategies
const PHILOSOPHIES = {
  BUFFETT_FEARFUL: {
    philosophy: '"Be greedy when others are fearful"',
    author: "Warren Buffett",
  },
  ROTHSCHILD_BLOOD: {
    philosophy: '"Buy when there\'s blood in the streets"',
    author: "Nathan Rothschild",
  },
  LIVERMORE_SITTING: {
    philosophy: '"It was always my sitting that made the big money"',
    author: "Jesse Livermore",
  },
  BARUCH_PROFIT: {
    philosophy: '"Nobody ever went broke taking a profit"',
    author: "Bernard Baruch",
  },
  BUFFETT_GREEDY: {
    philosophy: '"Be fearful when others are greedy"',
    author: "Warren Buffett",
  },
} as const;

export type RegimeId = "ef" | "f" | "n" | "g" | "eg";

export interface RegimeStrategy {
  philosophy: string;
  author: string;
  useCase?: {
    scenario: string;
    userIntent: string;
    zapAction: string;
    allocationBefore: RegimeAllocationBreakdown;
    allocationAfter: RegimeAllocationBreakdown;
    hideAllocationTarget?: boolean;
  };
}

export interface Regime {
  id: RegimeId;
  label: string;

  fillColor: string;
  // Visual configuration for UI components
  visual: {
    /** Tailwind badge classes for regime badge styling */
    badge: string;
    /** Tailwind gradient classes for visual elements */
    gradient: string;
    /** Lucide icon component for regime representation */
    icon: LucideIcon;
  };
  strategies:
    | {
        fromLeft: RegimeStrategy;
        fromRight: RegimeStrategy;
        default?: never;
      }
    | {
        fromLeft?: never;
        fromRight?: never;
        default: RegimeStrategy;
      };
}

export const regimes: Regime[] = [
  {
    id: "ef",
    label: "Extreme Fear",
    fillColor: "#22c55e",
    visual: {
      badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      gradient: "from-emerald-400 to-green-500",
      icon: TrendingDown,
    },
    strategies: {
      default: {
        ...PHILOSOPHIES.BUFFETT_FEARFUL,
        useCase: {
          scenario: "Bitcoin drops 33% from recent highs. FGI drops to 15.",
          userIntent:
            "I want to build spot exposure without trying to call the exact bottom.",
          zapAction:
            "Aggressively shifts capital from stable reserves into spot over 10 days while fear is extreme.",
          allocationBefore: ALLOCATION_STATES.DEFENSIVE,
          allocationAfter: ALLOCATION_STATES.ACCUMULATE,
        },
      },
    },
  },
  {
    id: "f",
    label: "Fear",

    fillColor: "#84cc16",
    visual: {
      badge: "bg-green-500/20 text-green-400 border-green-500/30",
      gradient: "from-green-400 to-teal-500",
      icon: TrendingDown,
    },
    strategies: {
      fromLeft: {
        ...PHILOSOPHIES.LIVERMORE_SITTING,
        useCase: {
          scenario:
            "Bitcoin stabilizes after bouncing 12% from recent lows. FGI rises to 35.",
          userIntent: "I want to hold my spot exposure during early recovery.",
          zapAction:
            "Maintains elevated spot exposure while recovery is still fragile. Zero rebalancing unless risk spikes.",
          allocationBefore: ALLOCATION_STATES.ACCUMULATE,
          allocationAfter: ALLOCATION_STATES.ACCUMULATE,
          hideAllocationTarget: true,
        },
      },
      fromRight: {
        ...PHILOSOPHIES.ROTHSCHILD_BLOOD,
        useCase: {
          scenario: "Bitcoin drops 8% from recent peak. FGI falls to 35.",
          userIntent:
            "I want to add spot exposure as fear grows, but not in one oversized trade.",
          zapAction:
            "Starts rotating stable reserves back into spot in measured steps as the market gets cheaper.",
          allocationBefore: ALLOCATION_STATES.TAKE_PROFIT,
          allocationAfter: ALLOCATION_STATES.BALANCED,
        },
      },
    },
  },
  {
    id: "n",
    label: "Neutral",

    fillColor: "#eab308",
    visual: {
      badge: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      gradient: "from-yellow-400 to-amber-500",
      icon: Pause,
    },
    strategies: {
      default: {
        ...PHILOSOPHIES.LIVERMORE_SITTING,
        useCase: {
          scenario: "FGI hovers between 46-54 for weeks.",
          userIntent:
            "I don't want to overtrade while the market is indecisive.",
          zapAction:
            "Keeps the portfolio near an even split between spot and stable reserves. Zero rebalancing unless drift becomes meaningful.",
          allocationBefore: ALLOCATION_STATES.BALANCED,
          allocationAfter: ALLOCATION_STATES.BALANCED,
          hideAllocationTarget: true,
        },
      },
    },
  },
  {
    id: "g",
    label: "Greed",

    fillColor: "#f97316",
    visual: {
      badge: "bg-orange-500/20 text-orange-400 border-orange-500/30",
      gradient: "from-orange-400 to-red-500",
      icon: TrendingUp,
    },
    strategies: {
      fromLeft: {
        ...PHILOSOPHIES.BARUCH_PROFIT,
        useCase: {
          scenario: "FGI rises to 65 during a bull run.",
          userIntent:
            "I want to lock in gains without fully exiting the market.",
          zapAction:
            "Gradually trims spot exposure into stable reserves while momentum remains positive.",
          allocationBefore: ALLOCATION_STATES.ACCUMULATE,
          allocationAfter: ALLOCATION_STATES.TAKE_PROFIT,
        },
      },
      fromRight: {
        ...PHILOSOPHIES.LIVERMORE_SITTING,
        useCase: {
          scenario: "Bitcoin corrects 25% from peak. FGI drops to 65.",
          userIntent: "I want to avoid catching falling knives.",
          zapAction:
            "Sits tight. The portfolio is already partially de-risked, so no extra selling is needed.",
          allocationBefore: ALLOCATION_STATES.TAKE_PROFIT,
          allocationAfter: ALLOCATION_STATES.TAKE_PROFIT,
          hideAllocationTarget: true,
        },
      },
    },
  },
  {
    id: "eg",
    label: "Extreme Greed",

    fillColor: "#ef4444",
    visual: {
      badge: "bg-red-500/20 text-red-400 border-red-500/30",
      gradient: "from-red-400 to-orange-500",
      icon: TrendingUp,
    },
    strategies: {
      default: {
        ...PHILOSOPHIES.BUFFETT_GREEDY,
        useCase: {
          scenario: "Bitcoin rallies 67% from recent lows. FGI hits 92.",
          userIntent: "I want to take profits but keep some exposure.",
          zapAction:
            "Takes larger profits by shifting more spot into stable reserves before euphoria unwinds.",
          allocationBefore: ALLOCATION_STATES.TAKE_PROFIT,
          allocationAfter: ALLOCATION_STATES.DEFENSIVE,
        },
      },
    },
  },
];

// regimeOrder removed - unused (2025-12-22)

/**
 * Get regime configuration by ID
 * @param regimeId - The regime identifier
 * @returns Regime configuration object
 */
export function getRegimeById(regimeId: RegimeId): Regime {
  const regime = regimes.find(r => r.id === regimeId);

  if (!regime) {
    // Fallback to neutral regime if not found
    const neutralRegime = regimes.find(r => r.id === "n");
    if (!neutralRegime) {
      throw new Error("Critical: Neutral regime not found in regimes array");
    }
    return neutralRegime;
  }

  // ... existing code ...
  return regime;
}

/**
 * Get the target allocation for a regime based on its default strategy
 * @param regime - The regime configuration
 * @returns Allocation split (crypto/stable)
 */
export function getRegimeAllocation(regime: Regime) {
  // Try default first, then fromLeft (first tab) if default is missing
  const strategy = regime.strategies.default || regime.strategies.fromLeft;
  const target = strategy?.useCase?.allocationAfter;

  if (target) {
    return {
      spot: target.spot,
      stable: target.stable,
    };
  }

  throw new Error(
    `Critical: No valid strategy found for regime ${regime.id} to determine allocation`
  );
}
