import { RegimeLabel } from "@/types/strategy";

export const REGIME_DISPLAY_CONFIG: Record<
  RegimeLabel,
  {
    label: string;
    color: string;
    bg: string;
    border: string;
    barColor: string;
    fillColor: string;
    value: number; // Default sentiment value if actual is missing
  }
> = {
  extreme_fear: {
    label: "Extreme Fear",
    color: "text-rose-500",
    bg: "bg-rose-500/10",
    border: "border-rose-500/20",
    barColor: "bg-rose-500",
    fillColor: "#f43f5e", // rose-500
    value: 10,
  },
  fear: {
    label: "Fear",
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
    barColor: "bg-orange-500",
    fillColor: "#f97316", // orange-500
    value: 30,
  },
  neutral: {
    label: "Neutral",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    barColor: "bg-blue-500",
    fillColor: "#60a5fa", // blue-400
    value: 50,
  },
  greed: {
    label: "Greed",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    barColor: "bg-emerald-500",
    fillColor: "#10b981", // emerald-500
    value: 70,
  },
  extreme_greed: {
    label: "Extreme Greed",
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/20",
    barColor: "bg-green-400",
    fillColor: "#4ade80", // green-400
    value: 90,
  },
};

export type RegimeDisplayConfig = (typeof REGIME_DISPLAY_CONFIG)[RegimeLabel];

export function getRegimeConfig(label: string): RegimeDisplayConfig {
  if (label in REGIME_DISPLAY_CONFIG) {
    return REGIME_DISPLAY_CONFIG[label as RegimeLabel];
  }

  return REGIME_DISPLAY_CONFIG.neutral;
}
