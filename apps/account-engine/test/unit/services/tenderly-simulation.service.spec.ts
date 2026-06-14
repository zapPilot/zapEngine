import { encodeFunctionData, erc20Abi, maxUint256 } from 'viem';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTenderlySimulationService } from '../../../src/services/tenderly-simulation.service';

const WALLET = '0x1111111111111111111111111111111111111111';
const TOKEN = '0x2222222222222222222222222222222222222222';
const SPENDER = '0x3333333333333333333333333333333333333333';
const TARGET = '0x4444444444444444444444444444444444444444';

const tokenInfo = {
  standard: 'ERC20',
  type: 'Fungible',
  contract_address: TOKEN,
  symbol: 'TKN',
  name: 'Token',
  logo: 'https://assets.example/token.png',
  decimals: 18,
};

const partialTokenInfo = {
  standard: 'ERC20',
  type: 'Fungible',
  contract_address: TOKEN,
};

function contract(
  address: string,
  options: {
    verified?: boolean;
    token?: boolean;
    partialToken?: boolean;
  } = {},
) {
  return {
    address,
    contract_name: options.token || options.partialToken ? 'Token' : 'Target',
    verified_by: options.verified === false ? '' : 'tenderly',
    ...(options.token
      ? { token_data: tokenInfo }
      : options.partialToken
        ? { token_data: partialTokenInfo }
        : {}),
  };
}

function simulationResult(options: {
  id: string;
  to?: string;
  status?: boolean;
  method?: string;
  gasUsed?: number;
  blockNumber?: number;
  errorMessage?: string;
  assetChanges?: unknown[] | null;
  exposureChanges?: unknown[] | null;
  contracts?: unknown[];
}) {
  const status = options.status ?? true;
  const gasUsed = options.gasUsed ?? 21_000;
  const blockNumber = options.blockNumber ?? 123;
  return {
    transaction: {
      status,
      to: options.to ?? TARGET,
      input: '0x1234',
      gas_used: gasUsed,
      block_number: blockNumber,
      method: options.method ?? 'execute',
      error_message: options.errorMessage,
      transaction_info: {
        asset_changes: options.assetChanges ?? [],
        ...(options.exposureChanges !== undefined
          ? { exposure_changes: options.exposureChanges }
          : {}),
      },
    },
    simulation: {
      id: options.id,
      status,
      gas_used: gasUsed,
      block_number: blockNumber,
      method: options.method ?? 'execute',
    },
    contracts: options.contracts ?? [contract(options.to ?? TARGET)],
  };
}

function response(results: unknown[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ simulation_results: results }),
  } as Response;
}

function createService(fetchFn: typeof fetch) {
  return createTenderlySimulationService({
    accountSlug: 'account-slug',
    projectSlug: 'project-slug',
    accessToken: 'secret-token',
    fetchFn,
  });
}

describe('TenderlySimulationService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('posts the full sequential bundle to the exact endpoint with decimal values', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      response([
        simulationResult({
          id: 'sim-1',
          to: TARGET,
          contracts: [contract(TARGET)],
        }),
      ]),
    );
    const service = createService(fetchFn);

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TARGET, data: '0x1234', value: '0x2a' }],
    });

    expect(result.status).toBe('passed');
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.tenderly.co/api/v1/account/account-slug/project/project-slug/simulate-bundle',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Access-Key': 'secret-token',
        },
        body: JSON.stringify({
          simulations: [
            {
              network_id: '8453',
              from: WALLET,
              to: TARGET,
              input: '0x1234',
              value: '42',
              gas: 8_000_000,
              save: true,
              save_if_fails: true,
              simulation_type: 'full',
            },
          ],
        }),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(result.shareUrls).toEqual([]);
  });

  it('fails closed as unavailable when configuration is missing', async () => {
    const fetchFn = vi.fn();
    const service = createTenderlySimulationService({ fetchFn });

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TARGET }],
    });

    expect(result.status).toBe('unavailable');
    expect(result).toMatchObject({
      unavailableReason: 'Tenderly simulation is not configured',
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('aborts the core simulation after ten seconds', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    }) as unknown as typeof fetch;
    const service = createService(fetchFn);

    const pending = service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TARGET }],
    });
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(pending).resolves.toMatchObject({
      status: 'unavailable',
      unavailableReason: 'Tenderly simulation timed out',
    });
  });

  it('rejects malformed Tenderly data instead of treating it as success', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        response([{ transaction: { status: 'yes' }, simulation: {} }]),
      );
    const service = createService(fetchFn);

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TARGET }],
    });

    expect(result).toMatchObject({
      status: 'unavailable',
      unavailableReason: 'Tenderly returned malformed simulation data',
    });
  });

  it('preserves a failed result and marks later unexecuted calls as skipped', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      response([
        simulationResult({ id: 'sim-1' }),
        simulationResult({
          id: 'sim-2',
          to: TOKEN,
          status: false,
          errorMessage: 'execution reverted: allowance too low',
          contracts: [contract(TOKEN, { token: true })],
        }),
      ]),
    );
    const service = createService(fetchFn);

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TARGET }, { to: TOKEN }, { to: SPENDER }],
    });

    expect(result).toMatchObject({
      status: 'failed',
      failureReason: 'execution reverted: allowance too low',
      calls: [
        expect.objectContaining({ index: 0, status: 'succeeded' }),
        expect.objectContaining({ index: 1, status: 'failed' }),
        expect.objectContaining({ index: 2, status: 'skipped' }),
      ],
    });
  });

  it('returns unavailable when Tenderly omits successful call results', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(response([simulationResult({ id: 'sim-1' })]));
    const service = createService(fetchFn);

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TARGET }, { to: TOKEN }],
    });

    expect(result).toMatchObject({
      status: 'unavailable',
      unavailableReason: expect.stringContaining('Tenderly returned'),
    });
  });

  it('keeps a successful simulation valid when sharing is not attempted', async () => {
    const warn = vi.fn();
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response([simulationResult({ id: 'sim-private' })]),
      );
    const service = createTenderlySimulationService({
      accountSlug: 'account-slug',
      projectSlug: 'project-slug',
      accessToken: 'secret-token',
      fetchFn,
      logger: { warn },
    });

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TARGET }],
    });

    expect(result.status).toBe('passed');
    expect(result.shareUrls).toEqual([]);
  });

  it('normalizes wallet-relative assets, approvals, contracts, and every risk rule', async () => {
    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [SPENDER, maxUint256],
    });
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response([
          simulationResult({
            id: 'sim-approve',
            to: TOKEN,
            method: 'approve',
            assetChanges: [
              {
                token_info: tokenInfo,
                type: 'Transfer',
                from: WALLET,
                to: SPENDER,
                raw_amount: '50',
                amount: '0.00000000000000005',
              },
            ],
            contracts: [contract(TOKEN, { verified: false, token: true })],
          }),
          simulationResult({
            id: 'sim-unknown',
            to: TARGET,
            method: '',
            contracts: [contract(TARGET)],
          }),
        ]),
      )
      .mockResolvedValue({ ok: true, status: 204 } as Response);
    const service = createService(fetchFn);

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [
        { to: TOKEN, data: approveData },
        { to: TARGET, data: '0x1234' },
      ],
    });

    expect(result.status).toBe('warning');
    expect(result.assetChanges).toEqual([
      expect.objectContaining({
        direction: 'out',
        rawAmount: '50',
        token: expect.objectContaining({ symbol: 'TKN', decimals: 18 }),
      }),
    ]);
    expect(result.approvals).toEqual([
      expect.objectContaining({
        spender: SPENDER,
        rawAmount: maxUint256.toString(),
        unlimited: true,
        simulatedSpendRaw: '50',
        exceedsSimulatedSpend: true,
      }),
    ]);
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      'UNVERIFIED_CONTRACT',
      'UNLIMITED_APPROVAL',
      'APPROVAL_EXCEEDS_SIMULATED_SPEND',
      'UNDECODED_METHOD',
    ]);
  });

  it('fingerprints only material results, not block, gas, IDs, or share links', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response([
          simulationResult({
            id: 'sim-1',
            gasUsed: 21_000,
            blockNumber: 100,
          }),
        ]),
      )
      .mockResolvedValueOnce(
        response([
          simulationResult({
            id: 'sim-2',
            gasUsed: 99_999,
            blockNumber: 200,
          }),
        ]),
      );
    const service = createService(fetchFn);
    const input = {
      chainId: 8453 as const,
      walletAddress: WALLET,
      calls: [{ to: TARGET }],
    };

    const first = await service.simulateBundle(input);
    const second = await service.simulateBundle(input);

    expect(first.simulationFingerprint).toBe(second.simulationFingerprint);
    expect(first.riskHash).toBe(second.riskHash);
    expect(first.blockNumber).not.toBe(second.blockNumber);
    expect(first.callGas).not.toBe(second.callGas);
    expect(first.simulationIds).not.toEqual(second.simulationIds);
    expect(first.shareUrls).toEqual([]);
    expect(second.shareUrls).toEqual([]);
  });

  it('handles null asset_changes without crashing', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      response([
        simulationResult({
          id: 'sim-null-assets',
          assetChanges: null,
        }),
      ]),
    );
    const service = createService(fetchFn);

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TARGET }],
    });

    expect(result.status).toBe('passed');
    expect(result.assetChanges).toEqual([]);
  });

  it('handles null exposure_changes without crashing', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response([
          simulationResult({
            id: 'sim-null-exposure',
            exposureChanges: null,
          }),
        ]),
      )
      .mockResolvedValue({ ok: true, status: 204 } as Response);
    const service = createService(fetchFn);

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TARGET }],
    });

    expect(result.status).toBe('passed');
    expect(result.approvals).toEqual([]);
  });

  it('uses fallback values when token_data is missing symbol, name, and decimals', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response([
          simulationResult({
            id: 'sim-partial-token',
            to: TOKEN,
            contracts: [contract(TOKEN, { partialToken: true })],
          }),
        ]),
      )
      .mockResolvedValue({ ok: true, status: 204 } as Response);
    const service = createService(fetchFn);

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TOKEN }],
    });

    expect(result.contracts[0]).toMatchObject({ address: TOKEN });
    expect(result.status).toBe('passed');
  });

  it('derives approvals from exposure_changes instead of calldata decode', async () => {
    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [SPENDER, maxUint256],
    });
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response([
          simulationResult({
            id: 'sim-exposure',
            to: TOKEN,
            method: 'approve',
            exposureChanges: [
              {
                token_info: tokenInfo,
                type: 'Approve',
                owner: WALLET,
                spender: SPENDER,
                raw_amount: '1000',
                amount: '0.000000000000001',
              },
            ],
            contracts: [contract(TOKEN, { token: true })],
          }),
        ]),
      )
      .mockResolvedValue({ ok: true, status: 204 } as Response);
    const service = createService(fetchFn);

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TOKEN, data: approveData }],
    });

    expect(result.approvals).toEqual([
      expect.objectContaining({
        owner: WALLET,
        spender: SPENDER,
        rawAmount: '1000',
        unlimited: false,
      }),
    ]);
    expect(result.approvals[0]!.rawAmount).not.toBe(maxUint256.toString());
  });

  it('prefers exposure_changes over calldata decode when both are present', async () => {
    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [SPENDER, maxUint256],
    });
    const limitedRaw = '500';
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response([
          simulationResult({
            id: 'sim-both',
            to: TOKEN,
            method: 'approve',
            exposureChanges: [
              {
                token_info: tokenInfo,
                type: 'Approve',
                owner: WALLET,
                spender: SPENDER,
                raw_amount: limitedRaw,
                amount: '0.0000000000000005',
              },
            ],
            contracts: [contract(TOKEN, { token: true })],
          }),
        ]),
      )
      .mockResolvedValue({ ok: true, status: 204 } as Response);
    const service = createService(fetchFn);

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TOKEN, data: approveData }],
    });

    expect(result.approvals).toHaveLength(1);
    expect(result.approvals[0]!.rawAmount).toBe(limitedRaw);
    expect(result.approvals[0]!.unlimited).toBe(false);
  });

  it('builds both assetChanges and approvals from combined asset_changes and exposure_changes', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response([
          simulationResult({
            id: 'sim-combined',
            to: TOKEN,
            method: 'approve',
            assetChanges: [
              {
                token_info: tokenInfo,
                type: 'Transfer',
                from: WALLET,
                to: SPENDER,
                raw_amount: '200',
                amount: '0.0000000000000002',
              },
            ],
            exposureChanges: [
              {
                token_info: tokenInfo,
                type: 'Approve',
                owner: WALLET,
                spender: SPENDER,
                raw_amount: '1000',
                amount: '0.000000000000001',
              },
            ],
            contracts: [contract(TOKEN, { token: true })],
          }),
        ]),
      )
      .mockResolvedValue({ ok: true, status: 204 } as Response);
    const service = createService(fetchFn);

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TOKEN }],
    });

    expect(result.assetChanges).toEqual([
      expect.objectContaining({
        direction: 'out',
        rawAmount: '200',
        token: expect.objectContaining({ symbol: 'TKN' }),
      }),
    ]);
    expect(result.approvals).toEqual([
      expect.objectContaining({
        spender: SPENDER,
        rawAmount: '1000',
        simulatedSpendRaw: '200',
        exceedsSimulatedSpend: true,
      }),
    ]);
  });
});
