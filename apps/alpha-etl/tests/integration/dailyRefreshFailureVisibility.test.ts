import { afterAll, describe, expect, it, vi } from 'vitest';

import { closeDbPool } from '../../src/config/database.js';
import type { VaultDetailsResponse } from '../../src/modules/hyperliquid/fetcher.js';
import type { DeBankTokenBalance } from '../../src/modules/wallet/fetcher.js';
import { createEtlJob } from '../utils/createEtlJob.js';

/**
 * The inverse of the bug: one provider's success must not clear another
 * provider's outage, and a provider that failed must still be due afterwards.
 *
 * This lives in its own file because the mock pool's refresh state is
 * module-level and only vitest's per-file isolation gives a run a clean
 * database to start from.
 */

const PRIORITY_WALLET = '0x1111111111111111111111111111111111111111';
const VAULT_ADDRESS = '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303';

const providers = vi.hoisted(() => ({
  fetchWalletTokenList: vi.fn(),
  fetchComplexProtocolList: vi.fn(),
  getVaultDetails: vi.fn(),
}));

vi.mock('../../src/utils/logger.js', async () => {
  const { mockLogger } = await import('../setup/mocks.js');
  return mockLogger();
});

vi.mock('../../src/observability/sentry.js', () => ({
  captureBackgroundException: vi.fn(),
}));

vi.mock('../../src/modules/wallet/fetcher.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/modules/wallet/fetcher.js')
    >();

  class StubbedDeBankFetcher extends actual.DeBankFetcher {
    override async fetchWalletTokenList(
      wallet: string,
    ): Promise<DeBankTokenBalance[]> {
      return providers.fetchWalletTokenList(wallet);
    }

    override async fetchComplexProtocolList(wallet: string) {
      return providers.fetchComplexProtocolList(wallet);
    }
  }

  return { ...actual, DeBankFetcher: StubbedDeBankFetcher };
});

vi.mock('../../src/modules/hyperliquid/fetcher.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/modules/hyperliquid/fetcher.js')
    >();

  class StubbedHyperliquidFetcher extends actual.HyperliquidFetcher {
    override async getVaultDetails(
      wallet: string,
    ): Promise<VaultDetailsResponse> {
      return providers.getVaultDetails(wallet);
    }
  }

  return { ...actual, HyperliquidFetcher: StubbedHyperliquidFetcher };
});

const { WalletBalanceETLProcessor } =
  await import('../../src/modules/wallet/processor.js');
const { HyperliquidVaultETLProcessor } =
  await import('../../src/modules/hyperliquid/processor.js');
const { SupabaseFetcher } =
  await import('../../src/modules/user-service/supabaseFetcher.js');

function debankToken(): DeBankTokenBalance {
  return {
    id: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    chain: 'eth',
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
    amount: 2,
    price: 3000,
    is_wallet: true,
    is_core: true,
    is_verified: true,
  } as DeBankTokenBalance;
}

function vaultDetails(): VaultDetailsResponse {
  return {
    vaultAddress: VAULT_ADDRESS,
    leader: '0x742d35cc6634c0532925a3b844bc9e7595f0beb1',
    name: 'HLP Vault',
    apr: 0.2547,
    totalVlm: 15_750_000,
    isClosed: false,
    allowDeposits: true,
    followerState: {
      user: PRIORITY_WALLET,
      vaultAddress: VAULT_ADDRESS,
      totalAccountValue: 50_000,
      maxWithdrawable: 48_000,
    },
    relationship: { type: 'follower' },
    totalFollowers: 5,
  };
}

async function dueSourcesForPriorityWallet(): Promise<string[] | undefined> {
  const candidates = await new SupabaseFetcher().fetchUserServiceStates();
  return candidates.find((candidate) => candidate.wallet === PRIORITY_WALLET)
    ?.dueSources;
}

describe('daily refresh failure visibility', () => {
  afterAll(() => closeDbPool());

  it('keeps a failed provider due while the other provider goes fresh', async () => {
    providers.fetchWalletTokenList.mockRejectedValue(
      new Error('DeBank unavailable'),
    );
    providers.fetchComplexProtocolList.mockResolvedValue([]);
    providers.getVaultDetails.mockResolvedValue(vaultDetails());

    const failedRun = await new WalletBalanceETLProcessor().process(
      createEtlJob({ jobId: 'debank-outage', sources: ['debank'] }),
    );

    expect(failedRun.success).toBe(false);
    expect(await dueSourcesForPriorityWallet()).toContain('debank');

    await new HyperliquidVaultETLProcessor().process(
      createEtlJob({
        jobId: 'hyperliquid-after-outage',
        sources: ['hyperliquid'],
      }),
    );

    // Hyperliquid landing cannot pay off DeBank's debt.
    expect(await dueSourcesForPriorityWallet()).toEqual(['debank']);

    providers.fetchWalletTokenList.mockReset();
    providers.fetchWalletTokenList.mockResolvedValue([debankToken()]);

    const recoveryRun = await new WalletBalanceETLProcessor().process(
      createEtlJob({ jobId: 'debank-recovery', sources: ['debank'] }),
    );

    expect(providers.fetchWalletTokenList).toHaveBeenCalledWith(
      PRIORITY_WALLET,
    );
    expect(recoveryRun.success).toBe(true);
    expect(await dueSourcesForPriorityWallet()).toEqual([]);
  });
});
