import {
  HyperliquidVaultDepositError,
  submitVaultDeposit,
} from '@core/services/hyperliquidService';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const HLP = '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303';

// Deliberately omits `TransportError`: this is what a renamed or restructured
// SDK error surface looks like to submitVaultDeposit. It lives in its own file
// because the module-level SDK mock is per-file.
const sdkMocks = vi.hoisted(() => {
  const vaultTransfer = vi.fn();
  return {
    vaultTransfer,
    HttpTransport: vi.fn(function HttpTransport() {
      return {};
    }),
    ExchangeClient: vi.fn(function ExchangeClient() {
      return { vaultTransfer };
    }),
  };
});

vi.mock('@nktkas/hyperliquid', () => ({
  HttpTransport: sdkMocks.HttpTransport,
  ExchangeClient: sdkMocks.ExchangeClient,
}));

describe('submitVaultDeposit against a drifted SDK error surface', () => {
  beforeEach(() => {
    sdkMocks.vaultTransfer.mockReset();
  });

  it('fails closed: an unclassifiable failure is treated as ambiguous', async () => {
    sdkMocks.vaultTransfer.mockRejectedValue(new Error('boom'));

    const error = (await submitVaultDeposit({
      walletClient: { signTypedData: vi.fn() } as never,
      vaultAddress: HLP,
      usd6: 20_000_000n,
    }).catch((caught: unknown) => caught)) as HyperliquidVaultDepositError;

    // Without the class the transfer cannot be proven un-accepted, and
    // re-arming the CTA on a live deposit would lock funds twice.
    expect(error).toBeInstanceOf(HyperliquidVaultDepositError);
    expect(error.ambiguous).toBe(true);
  });

  it('still rejects an unsafe amount before reaching the SDK', async () => {
    await expect(
      submitVaultDeposit({
        walletClient: { signTypedData: vi.fn() } as never,
        vaultAddress: HLP,
        usd6: 0n,
      }),
    ).rejects.toThrow('must be positive');
    expect(sdkMocks.vaultTransfer).not.toHaveBeenCalled();
  });
});
