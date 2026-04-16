// Convenience sets for fast asset symbol lookups (lowercased)
export const ASSET_SYMBOL_SETS = {
  btc: new Set(["btc", "wbtc", "cbbtc", "tbtc"].map(s => s.toLowerCase())),
  eth: new Set(
    ["eth", "weth", "steth", "wsteth", "weeth", "mseth", "frxeth"].map(s =>
      s.toLowerCase()
    )
  ),
  stablecoins: new Set(
    [
      "usdc",
      "usdt",
      "dai",
      "frax",
      "usd₮0",
      "bold",
      "msusd",
      "openusdt",
      "susd",
      "gho",
      "vst",
      "frxusd",
      "wfrax",
      "legacy frax dollar",
    ].map(s => s.toLowerCase())
  ),
} as const;
