import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WalletClient } from 'viem';

const getCapabilitiesMock = vi.fn();

vi.mock('viem/actions', async () => {
  const actual =
    await vi.importActual<typeof import('viem/actions')>('viem/actions');
  return {
    ...actual,
    getCapabilities: (...args: unknown[]) => getCapabilitiesMock(...args),
  };
});

// Import AFTER the mock so the module picks up the mocked export
const { detectEIP7702Support, determineExecutionStrategy } =
  await import('../../src/execution/capability.detector.js');

const DUMMY_WALLET = {} as WalletClient;

describe('detectEIP7702Support', () => {
  beforeEach(() => {
    getCapabilitiesMock.mockReset();
  });

  it('returns true when atomic.status === "supported"', async () => {
    getCapabilitiesMock.mockResolvedValueOnce({
      atomic: { status: 'supported' },
    });
    expect(await detectEIP7702Support(DUMMY_WALLET, 1)).toBe(true);
  });

  it('returns true when atomic.status === "ready" (EOA already delegated)', async () => {
    getCapabilitiesMock.mockResolvedValueOnce({ atomic: { status: 'ready' } });
    expect(await detectEIP7702Support(DUMMY_WALLET, 1)).toBe(true);
  });

  it('returns false when atomic.status === "unsupported"', async () => {
    getCapabilitiesMock.mockResolvedValueOnce({
      atomic: { status: 'unsupported' },
    });
    expect(await detectEIP7702Support(DUMMY_WALLET, 1)).toBe(false);
  });

  it('returns false when atomic key is absent', async () => {
    getCapabilitiesMock.mockResolvedValueOnce({
      paymasterService: { supported: true },
    });
    expect(await detectEIP7702Support(DUMMY_WALLET, 1)).toBe(false);
  });

  it('returns false when capabilities response is empty', async () => {
    getCapabilitiesMock.mockResolvedValueOnce({});
    expect(await detectEIP7702Support(DUMMY_WALLET, 1)).toBe(false);
  });

  it('returns true when atomic support is advertised globally under chain 0', async () => {
    getCapabilitiesMock.mockResolvedValueOnce({}).mockResolvedValueOnce({
      0: { atomic: { status: 'supported' } },
    });

    expect(await detectEIP7702Support(DUMMY_WALLET, 8453)).toBe(true);
  });

  it('returns true when atomic support is advertised globally under raw 0x0', async () => {
    getCapabilitiesMock.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
      '0x0': { atomic: { status: 'ready' } },
    });

    expect(await detectEIP7702Support(DUMMY_WALLET, 8453)).toBe(true);
  });

  it('returns false when chain-specific unsupported overrides global support', async () => {
    getCapabilitiesMock.mockResolvedValueOnce({
      atomic: { status: 'unsupported' },
    });

    expect(await detectEIP7702Support(DUMMY_WALLET, 8453)).toBe(false);
    expect(getCapabilitiesMock).toHaveBeenCalledTimes(1);
  });

  it('returns false when wallet.request throws (non-EIP-5792 wallet)', async () => {
    getCapabilitiesMock.mockRejectedValueOnce(new Error('Method not found'));
    expect(await detectEIP7702Support(DUMMY_WALLET, 1)).toBe(false);
  });

  it('forwards chainId to getCapabilities', async () => {
    getCapabilitiesMock.mockResolvedValueOnce({
      atomic: { status: 'supported' },
    });
    await detectEIP7702Support(DUMMY_WALLET, 8453);
    expect(getCapabilitiesMock).toHaveBeenCalledWith(DUMMY_WALLET, {
      chainId: 8453,
    });
  });
});

describe('determineExecutionStrategy', () => {
  beforeEach(() => {
    getCapabilitiesMock.mockReset();
  });

  it('returns "sequential" when no wallet is provided', async () => {
    expect(await determineExecutionStrategy()).toBe('sequential');
    expect(getCapabilitiesMock).not.toHaveBeenCalled();
  });

  it('returns "sequential" when wallet is provided but chainId is not', async () => {
    expect(await determineExecutionStrategy(DUMMY_WALLET)).toBe('sequential');
    expect(getCapabilitiesMock).not.toHaveBeenCalled();
  });

  it('returns "eip7702" when the wallet reports atomic support', async () => {
    getCapabilitiesMock.mockResolvedValueOnce({
      atomic: { status: 'supported' },
    });
    expect(await determineExecutionStrategy(DUMMY_WALLET, 1)).toBe('eip7702');
  });

  it('returns "sequential" when the wallet does not support atomic batching', async () => {
    getCapabilitiesMock.mockResolvedValueOnce({
      atomic: { status: 'unsupported' },
    });
    expect(await determineExecutionStrategy(DUMMY_WALLET, 1)).toBe(
      'sequential',
    );
  });

  it('returns "sequential" when capability detection errors', async () => {
    getCapabilitiesMock.mockRejectedValueOnce(new Error('network error'));
    expect(await determineExecutionStrategy(DUMMY_WALLET, 1)).toBe(
      'sequential',
    );
  });
});
