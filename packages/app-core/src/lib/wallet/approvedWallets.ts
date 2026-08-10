export interface ApprovedWallet {
  /** Stable execution identity used for EIP-7702 delegation checks. */
  brand: ApprovedWalletBrand;
  /** EIP-6963 reverse-DNS identifier. */
  rdns: string;
  /** Lowercase substring used to match the connector display name. */
  nameNeedle: string;
  /** Product-facing brand name. */
  label: string;
}

export type ApprovedWalletBrand = 'ambire' | 'okx' | 'metamask';

/**
 * Wallets verified against Zap Pilot's supported chains, in display order.
 *
 * Match primarily by the EIP-6963 display name: it is a stable,
 * human-authored field every wallet sets to its own brand. Reverse-DNS
 * identifiers are not published in one canonical place, so `rdns` is kept as
 * a defensive secondary signal.
 */
export const APPROVED_WALLETS: readonly ApprovedWallet[] = [
  {
    brand: 'ambire',
    rdns: 'com.ambire',
    nameNeedle: 'ambire',
    label: 'Ambire',
  },
  {
    brand: 'okx',
    rdns: 'com.okex.wallet',
    nameNeedle: 'okx',
    label: 'OKX Wallet',
  },
  {
    brand: 'metamask',
    rdns: 'io.metamask',
    nameNeedle: 'metamask',
    label: 'MetaMask',
  },
];

export function approvedWalletBrand(connector: {
  id: string;
  name: string;
}): ApprovedWalletBrand | null {
  const rank = approvedWalletRank(connector);
  return APPROVED_WALLETS[rank]?.brand ?? null;
}

export function approvedWalletLabel(brand: ApprovedWalletBrand): string {
  return (
    APPROVED_WALLETS.find((wallet) => wallet.brand === brand)?.label ?? brand
  );
}

export function approvedWalletRank(connector: {
  id: string;
  name: string;
}): number {
  const name = connector.name.toLowerCase();
  const nameRank = APPROVED_WALLETS.findIndex((wallet) =>
    name.includes(wallet.nameNeedle),
  );
  if (nameRank !== -1) {
    return nameRank;
  }
  const rdnsRank = APPROVED_WALLETS.findIndex(
    (wallet) => connector.id === wallet.rdns,
  );
  return rdnsRank === -1 ? APPROVED_WALLETS.length : rdnsRank;
}

export function isApprovedWalletConnector(connector: {
  id: string;
  name: string;
}): boolean {
  return approvedWalletRank(connector) < APPROVED_WALLETS.length;
}

export function formatApprovedWalletList(): string {
  const labels = APPROVED_WALLETS.map((wallet) => wallet.label);
  if (labels.length === 1) {
    return labels[0] ?? '';
  }
  const lastLabel = labels.pop();
  return `${labels.join(', ')}, or ${lastLabel ?? ''}`;
}
