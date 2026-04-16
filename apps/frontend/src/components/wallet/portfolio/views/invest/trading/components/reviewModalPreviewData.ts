import { Cpu, Globe, ShieldCheck, Zap } from "lucide-react";

import { buildInvestAllocationComparison } from "@/components/wallet/regime/investAllocation";

export const MOCK_STRATEGY = {
  regime: {
    label: "Extreme Fear",
    id: "ef",
    fgi: 15,
    direction: "worsening" as const,
    duration_days: 4,
  },
  philosophy: {
    quote: "Be greedy when others are fearful",
    author: "Warren Buffett",
  },
  patternReason:
    "FGI dropped below 20 for 3+ consecutive days while BTC holds above 200-day moving average — historically a strong accumulation signal.",
  pacing: {
    currentStep: 1,
    totalSteps: 8,
    convergencePct: 0.15,
    intervalDays: 3,
  },
  backtest: {
    roi: 42.3,
    sharpe: 1.85,
    maxDrawdown: -12.4,
    vsHodl: 18.2,
    period: "365 days",
  },
};

export const MOCK_ALLOCATION = buildInvestAllocationComparison(
  { spot: 0.45, stable: 0.55 },
  { spot: 0.7, stable: 0.3 }
).map(({ label, current, target }) => ({
  bucket: label,
  current,
  target,
}));

export const MOCK_ROUTE = [
  {
    type: "source",
    chain: "Ethereum Mainnet",
    asset: "10.5 ETH",
    icon: Globe,
  },
  {
    type: "bridge",
    protocol: "Across Protocol",
    duration: "~2 mins",
    icon: Zap,
  },
  {
    type: "target",
    chain: "Arbitrum One",
    asset: "10.5 ETH",
    icon: Globe,
  },
  {
    type: "action",
    protocol: "Uniswap V3",
    action: "Swap ETH -> WBTC",
    impact: "-0.02%",
    icon: Cpu,
  },
  {
    type: "finish",
    protocol: "All-Weather Vault",
    action: "Vault Allocation",
    icon: ShieldCheck,
  },
];
