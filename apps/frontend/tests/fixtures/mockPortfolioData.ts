import type { WalletPortfolioDataWithDirection } from "@/adapters/walletPortfolioDataAdapter";
import type { RegimeId } from "@/components/wallet/regime/regimeData";

const BASE_ALLOCATION = {
  crypto: 65,
  stable: 35,
  constituents: {
    crypto: [
      {
        asset: "BTC",
        symbol: "BTC",
        name: "Bitcoin",
        value: 40,
        color: "#F7931A",
      },
      {
        asset: "ETH",
        symbol: "ETH",
        name: "Ethereum",
        value: 35,
        color: "#627EEA",
      },
      {
        asset: "SOL",
        symbol: "SOL",
        name: "Solana",
        value: 15,
        color: "#14F195",
      },
      {
        asset: "Others",
        symbol: "ALT",
        name: "Altcoins",
        value: 10,
        color: "#8C8C8C",
      },
    ],
    stable: [
      {
        asset: "USDC",
        symbol: "USDC",
        name: "USD Coin",
        value: 60,
        color: "#2775CA",
      },
      {
        asset: "USDT",
        symbol: "USDT",
        name: "Tether",
        value: 40,
        color: "#26A17B",
      },
    ],
  },
  simplifiedCrypto: [
    {
      asset: "BTC",
      symbol: "BTC",
      name: "Bitcoin",
      value: 40,
      color: "#F7931A",
    },
    {
      asset: "ETH",
      symbol: "ETH",
      name: "Ethereum",
      value: 35,
      color: "#627EEA",
    },
    {
      asset: "ALT",
      symbol: "ALT",
      name: "Altcoins",
      value: 25,
      color: "#8C8C8C",
    },
  ],
};

export const MOCK_DATA: WalletPortfolioDataWithDirection = {
  // Portfolio metrics
  balance: 45230.5,
  roiChange7d: 8.2,
  roiChange30d: 12.4,

  // Market sentiment
  sentimentValue: 68,
  sentimentStatus: "Greed",
  sentimentQuote:
    "Market conditions favor aggressive positioning with higher allocation to growth assets. Technical indicators show sustained momentum.",

  // Regime data
  currentRegime: "g" as RegimeId,
  previousRegime: null,
  strategyDirection: "default",
  regimeDuration: null,

  // Allocations
  currentAllocation: BASE_ALLOCATION,
  targetAllocation: {
    crypto: 80,
    stable: 20,
  },
  delta: 15,

  // Portfolio details
  positions: 8,
  protocols: 4,
  chains: 3,

  // Loading states
  isLoading: false,
  hasError: false,
};

export const MOCK_SCENARIOS: Record<string, WalletPortfolioDataWithDirection> =
  {
    extremeFear: {
      ...MOCK_DATA,
      sentimentValue: 15,
      sentimentStatus: "Extreme Fear",
      currentRegime: "ef",
      targetAllocation: { crypto: 30, stable: 70 },
      delta: 35,
    },
    neutral: {
      ...MOCK_DATA,
      sentimentValue: 50,
      sentimentStatus: "Neutral",
      currentRegime: "n",
      currentAllocation: {
        ...BASE_ALLOCATION,
        crypto: 50,
        stable: 50,
      },
      targetAllocation: { crypto: 50, stable: 50 },
      delta: 0,
    },
    extremeGreed: {
      ...MOCK_DATA,
      sentimentValue: 92,
      sentimentStatus: "Extreme Greed",
      currentRegime: "eg",
      targetAllocation: { crypto: 90, stable: 10 },
      delta: 25,
    },
  };
