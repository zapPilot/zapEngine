import { describe, expect, it } from 'vitest';
import { arbitrum, base, optimism } from 'viem/chains';

import {
  MOBILE_PRIVY_CHAINS,
  buildConnectedWallets,
  getMobilePrivyChain,
  requireMobilePrivyChain,
  shouldSwitchChain,
  toEip155HexChainId,
} from '@/integration/walletBackendModel';

const ADDRESS = '0x1111111111111111111111111111111111111111';

describe('wallet backend model helpers', () => {
  it('keeps the mobile Privy chain allowlist explicit', () => {
    expect(MOBILE_PRIVY_CHAINS.map((chain) => chain.id)).toEqual([
      arbitrum.id,
      base.id,
      optimism.id,
    ]);
  });

  it('defaults unknown current state to Arbitrum for local chain display', () => {
    expect(getMobilePrivyChain(undefined).id).toBe(arbitrum.id);
    expect(getMobilePrivyChain(999_999).id).toBe(arbitrum.id);
  });

  it('rejects unsupported target chains before hitting the provider', () => {
    expect(requireMobilePrivyChain(base.id).id).toBe(base.id);
    expect(() => requireMobilePrivyChain(1)).toThrow('Unsupported Privy');
  });

  it('converts chain ids to wallet_switchEthereumChain hex params', () => {
    expect(toEip155HexChainId(arbitrum.id)).toBe('0xa4b1');
    expect(toEip155HexChainId(base.id)).toBe('0x2105');
    expect(() => toEip155HexChainId(0)).toThrow('Invalid EIP-155');
  });

  it('decides whether sendTransaction needs a pre-flight switch', () => {
    expect(shouldSwitchChain(arbitrum.id, arbitrum.id)).toBe(false);
    expect(shouldSwitchChain(arbitrum.id, base.id)).toBe(true);
    expect(shouldSwitchChain(undefined, base.id)).toBe(true);
  });

  it('normalizes the single active wallet shape app-core expects', () => {
    expect(buildConnectedWallets(ADDRESS)).toEqual([
      { address: ADDRESS, isActive: true },
    ]);
    expect(buildConnectedWallets(null)).toEqual([]);
  });
});
