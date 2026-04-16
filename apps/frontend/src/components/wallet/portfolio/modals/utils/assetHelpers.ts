// Internal constants used by getChainLogo and getProtocolLogo
const CHAIN_LOGOS: Record<number, string> = {
  42161: "/chains/arbitrum.svg",
  10: "/chains/optimism.svg",
  8453: "/chains/base.svg",
  1088: "/chains/metis.svg",
};

const PROTOCOL_LOGOS: Record<string, string> = {
  gmx: "/protocols/gmx-v2.webp",
  hyperliquid: "/protocols/hyperliquid.webp",
  morpho: "/protocols/morpho.webp",
  aster: "/protocols/aster.webp",
};

export function getChainLogo(chainId: number | undefined): string {
  if (!chainId) return "";
  return CHAIN_LOGOS[chainId] || "/chains/arbitrum.svg"; // Fallback to Arbitrum or generic
}

export function getProtocolLogo(protocolId: string | undefined): string {
  if (!protocolId) return "";
  // Simple fuzzy matching or direct lookup
  const key = Object.keys(PROTOCOL_LOGOS).find(k =>
    protocolId.toLowerCase().includes(k)
  );
  if (key) {
    const logo = PROTOCOL_LOGOS[key];
    if (logo) return logo;
  }
  return "/protocols/hyperliquid.webp"; // Fallback
}
