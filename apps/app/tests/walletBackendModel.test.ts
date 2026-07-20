import { describe, expect, it } from 'vitest';
import { arbitrum, base, optimism } from 'viem/chains';

import {
  assertNativeWalletChain,
  buildConnectedWallets,
  DEFAULT_NATIVE_WALLET_CHAIN,
  getNativeWalletChain,
  NATIVE_WALLET_SUPPORTED_CHAINS,
  shouldSwitchChain,
  toWalletError,
  toWalletSwitchEthereumChainParams,
} from '@/integration/walletBackendModel';

describe('native wallet backend model', () => {
  it('keeps the Privy-supported chain set explicit and ordered', () => {
    expect(NATIVE_WALLET_SUPPORTED_CHAINS.map((chain) => chain.id)).toEqual([
      arbitrum.id,
      base.id,
      optimism.id,
    ]);
    expect(DEFAULT_NATIVE_WALLET_CHAIN.id).toBe(arbitrum.id);
  });

  it('resolves supported chains and falls back to the default chain', () => {
    expect(getNativeWalletChain(base.id).id).toBe(base.id);
    expect(getNativeWalletChain(null).id).toBe(arbitrum.id);
    expect(getNativeWalletChain(999_999).id).toBe(arbitrum.id);
  });

  it('rejects unsupported chain ids for user-initiated wallet operations', () => {
    expect(assertNativeWalletChain(optimism.id).id).toBe(optimism.id);
    expect(() => assertNativeWalletChain(1)).toThrow(
      'Unsupported mobile wallet chain 1',
    );
  });

  it('models the single active embedded wallet list shape', () => {
    expect(buildConnectedWallets(undefined)).toEqual([]);
    expect(buildConnectedWallets('0xabc')).toEqual([
      { address: '0xabc', isActive: true },
    ]);
  });

  it('only switches chains when the requested chain differs', () => {
    expect(shouldSwitchChain(arbitrum.id, base.id)).toBe(true);
    expect(shouldSwitchChain(base.id, base.id)).toBe(false);
  });

  it('formats wallet_switchEthereumChain params as hex chain ids', () => {
    expect(toWalletSwitchEthereumChainParams(base.id)).toEqual([
      { chainId: '0x2105' },
    ]);
  });

  it('preserves wallet provider error messages for UI state', () => {
    expect(toWalletError(new Error('Provider rejected request'))).toEqual({
      message: 'Provider rejected request',
    });
    expect(toWalletError({ code: 4001 })).toEqual({
      message: '[object Object]',
    });
  });
});
