import {
  ensureChain,
  requireUserAddress,
} from '@zapengine/app-core/hooks/useDepositExecutionState';
import type { Address } from 'viem';
import { describe, expect, it, vi } from 'vitest';

describe('requireUserAddress', () => {
  const ADDRESS = '0x1111111111111111111111111111111111111111' as Address;

  it('returns the address when provided', () => {
    expect(requireUserAddress(ADDRESS)).toBe(ADDRESS);
  });

  it('returns the address when provided as string', () => {
    const addr = '0x2222222222222222222222222222222222222222';
    expect(requireUserAddress(addr)).toBe(addr);
  });

  it('throws "Connect wallet first" when address is undefined', () => {
    expect(() => requireUserAddress(undefined)).toThrow('Connect wallet first');
  });
});

describe('ensureChain', () => {
  const SWITCH_CHAIN = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not call switchChain when already on target chain', async () => {
    await ensureChain(42161, 42161, SWITCH_CHAIN);
    expect(SWITCH_CHAIN).not.toHaveBeenCalled();
  });

  it('calls switchChain when on different chain', async () => {
    await ensureChain(1, 42161, SWITCH_CHAIN);
    expect(SWITCH_CHAIN).toHaveBeenCalledWith(42161);
  });

  it('calls switchChain when currentChainId is undefined', async () => {
    await ensureChain(undefined, 42161, SWITCH_CHAIN);
    expect(SWITCH_CHAIN).toHaveBeenCalledWith(42161);
  });

  it('does not call switchChain when currentChainId is null', async () => {
    await ensureChain(null as unknown as number, 42161, SWITCH_CHAIN);
    expect(SWITCH_CHAIN).toHaveBeenCalledWith(42161);
  });

  it('propagates switchChain errors', async () => {
    const error = new Error('Chain switch failed');
    const failingSwitchChain = vi.fn().mockRejectedValue(error);
    await expect(ensureChain(1, 42161, failingSwitchChain)).rejects.toThrow(
      'Chain switch failed',
    );
  });

  it('awaits switchChain completion', async () => {
    SWITCH_CHAIN.mockResolvedValue(undefined);
    await ensureChain(1, 42161, SWITCH_CHAIN);
    expect(SWITCH_CHAIN).toHaveBeenCalledTimes(1);
  });
});
