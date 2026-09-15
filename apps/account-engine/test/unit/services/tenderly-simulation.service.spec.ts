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
  options: { token?: boolean; partialToken?: boolean } = {},
) {
  let tokenData: typeof tokenInfo | typeof partialTokenInfo | undefined;
  if (options.token) tokenData = tokenInfo;
  else if (options.partialToken) tokenData = partialTokenInfo;

  return {
    address,
    contract_name: options.token || options.partialToken ? 'Token' : 'Target',
    ...(tokenData ? { token_data: tokenData } : {}),
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

  it('returns unavailable when Tenderly returns a non-OK HTTP response', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
    });
    const service = createService(fetchFn);

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TARGET }],
    });

    expect(result).toMatchObject({
      status: 'unavailable',
      unavailableReason: expect.stringContaining(
        'Tenderly simulation returned HTTP 500',
      ),
    });
  });

  it('normalizes wallet-relative asset changes sent to the wallet as incoming', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response([
          simulationResult({
            id: 'sim-incoming',
            assetChanges: [
              {
                token_info: tokenInfo,
                type: 'Transfer',
                from: SPENDER,
                to: WALLET,
                raw_amount: '100',
                amount: '0.0000000000000001',
              },
            ],
            contracts: [contract(TOKEN, { token: true })],
          }),
        ]),
      )
      .mockResolvedValue({ ok: true, status: 204 });
    const service = createService(fetchFn);

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TOKEN, data: '0x1234' }],
    });

    expect(result.assetChanges).toEqual([
      expect.objectContaining({
        direction: 'in',
        rawAmount: '100',
      }),
    ]);
  });

  it('skips asset changes where neither from nor to matches the wallet', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response([
          simulationResult({
            id: 'sim-third-party',
            assetChanges: [
              {
                token_info: tokenInfo,
                type: 'Transfer',
                from: SPENDER,
                to: TARGET,
                raw_amount: '50',
                amount: '0.00000000000000005',
              },
            ],
            contracts: [contract(TOKEN, { token: true })],
          }),
        ]),
      )
      .mockResolvedValue({ ok: true, status: 204 });
    const service = createService(fetchFn);

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TOKEN, data: '0x1234' }],
    });

    expect(result.assetChanges).toEqual([]);
  });

  it('posts the full sequential bundle to the exact endpoint with decimal values', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response([
          simulationResult({
            id: 'sim-1',
            to: TARGET,
            contracts: [contract(TARGET)],
          }),
        ]),
      )
      .mockResolvedValueOnce({ ok: true, status: 204 });
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
              simulation_type: 'quick',
            },
          ],
        }),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.tenderly.co/api/v1/account/account-slug/project/project-slug/simulations/sim-1/share',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Access-Key': 'secret-token',
        },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(result.shareUrls).toEqual([
      'https://www.tdly.co/shared/simulation/sim-1',
    ]);
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

  it('aborts the core simulation after thirty seconds', async () => {
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
    await vi.advanceTimersByTimeAsync(30_000);

    await expect(pending).resolves.toMatchObject({
      status: 'unavailable',
      unavailableReason: 'Tenderly simulation timed out',
    });
  });

  it('reports a halted invalid call as failed using the stub simulation reason', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response([
          simulationResult({ id: 'sim-ok' }),
          {
            transaction: null,
            simulation: {
              id: '',
              status: false,
              gas_used: 0,
              block_number: null,
              error_message:
                'agent call: insufficient funds for gas * price + value: address have 0 want 1000000000000000: invalid transaction simulation',
            },
            contracts: [],
          },
        ]),
      )
      .mockResolvedValue({ ok: true, status: 204 });
    const service = createService(fetchFn);

    const result = await service.simulateBundle({
      chainId: 42161,
      walletAddress: WALLET,
      calls: [
        { to: TARGET, data: '0x1234' },
        { to: TARGET, data: '0x5678' },
        { to: TARGET, data: '0x9abc' },
      ],
    });

    expect(result.status).toBe('failed');
    expect(result).toMatchObject({
      failureReason: expect.stringContaining('insufficient funds for gas'),
    });
    expect(result.calls.map((call) => call.status)).toEqual([
      'succeeded',
      'failed',
      'skipped',
    ]);
    expect(result.simulationIds).toEqual(['sim-ok']);
    expect(result.shareUrls).toEqual([
      'https://www.tdly.co/shared/simulation/sim-ok',
    ]);
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

  it('rejects a non-numeric raw_amount instead of throwing during normalization', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      response([
        simulationResult({
          id: 'sim-bad-amount',
          assetChanges: [
            {
              token_info: tokenInfo,
              type: 'Transfer',
              from: SPENDER,
              to: WALLET,
              raw_amount: 'not-a-number',
              amount: '0',
            },
          ],
          contracts: [contract(TOKEN, { token: true })],
        }),
      ]),
    );
    const service = createService(fetchFn);

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TOKEN, data: '0x1234' }],
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

  it('keeps a successful simulation valid when public sharing fails', async () => {
    const warn = vi.fn();
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response([simulationResult({ id: 'sim-private' })]),
      )
      .mockResolvedValueOnce({ ok: false, status: 500 });
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
    expect(warn).toHaveBeenCalledWith(
      'Tenderly simulation sharing failed',
      expect.objectContaining({ simulationId: 'sim-private', status: 500 }),
    );
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
            contracts: [contract(TOKEN, { token: true })],
          }),
          simulationResult({
            id: 'sim-unknown',
            to: TARGET,
            method: '',
            contracts: [contract(TARGET)],
          }),
        ]),
      )
      .mockResolvedValue({ ok: true, status: 204 });
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
      'UNLIMITED_APPROVAL',
      'APPROVAL_EXCEEDS_SIMULATED_SPEND',
      'UNDECODED_METHOD',
    ]);
  });

  it('names non-ERC20 calls through the injected decoder and drops their warning', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response([
          simulationResult({
            id: 'sim-vault',
            to: TARGET,
            method: '',
            contracts: [contract(TARGET)],
          }),
        ]),
      )
      .mockResolvedValue({ ok: true, status: 204 });
    const decodeProtocolMethod = vi.fn().mockReturnValue('deposit');
    const service = createTenderlySimulationService({
      accountSlug: 'account-slug',
      projectSlug: 'project-slug',
      accessToken: 'secret-token',
      fetchFn,
      decodeProtocolMethod,
    });

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TARGET, data: '0x1234' }],
    });

    expect(decodeProtocolMethod).toHaveBeenCalledWith('0x1234');
    expect(result.calls[0]?.method).toBe('deposit');
    expect(result.warnings.map((warning) => warning.code)).not.toContain(
      'UNDECODED_METHOD',
    );
  });

  it('keeps the ERC-20 decode ahead of the injected decoder', async () => {
    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [SPENDER, 1n],
    });
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response([
          simulationResult({ id: 'sim-approve', to: TOKEN, method: '' }),
        ]),
      )
      .mockResolvedValue({ ok: true, status: 204 });
    const decodeProtocolMethod = vi.fn().mockReturnValue('deposit');
    const service = createTenderlySimulationService({
      accountSlug: 'account-slug',
      projectSlug: 'project-slug',
      accessToken: 'secret-token',
      fetchFn,
      decodeProtocolMethod,
    });

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TOKEN, data: approveData }],
    });

    expect(result.calls[0]?.method).toBe('approve');
    expect(decodeProtocolMethod).not.toHaveBeenCalled();
  });

  it('warns UNDECODED_METHOD when the injected decoder does not know the selector', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response([
          simulationResult({ id: 'sim-lifi', to: TARGET, method: '' }),
        ]),
      )
      .mockResolvedValue({ ok: true, status: 204 });
    const service = createTenderlySimulationService({
      accountSlug: 'account-slug',
      projectSlug: 'project-slug',
      accessToken: 'secret-token',
      fetchFn,
      decodeProtocolMethod: () => null,
    });

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TARGET, data: '0x1234' }],
    });

    expect(result.calls[0]?.method).toBeNull();
    expect(result.warnings.map((warning) => warning.code)).toContain(
      'UNDECODED_METHOD',
    );
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
      .mockResolvedValueOnce({ ok: true, status: 204 })
      .mockResolvedValueOnce(
        response([
          simulationResult({
            id: 'sim-2',
            gasUsed: 99_999,
            blockNumber: 200,
          }),
        ]),
      )
      .mockResolvedValueOnce({ ok: true, status: 204 });
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
    expect(first.shareUrls).toEqual([
      'https://www.tdly.co/shared/simulation/sim-1',
    ]);
    expect(second.shareUrls).toEqual([
      'https://www.tdly.co/shared/simulation/sim-2',
    ]);
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
      .mockResolvedValue({ ok: true, status: 204 });
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
      .mockResolvedValue({ ok: true, status: 204 });
    const service = createService(fetchFn);

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TOKEN }],
    });

    expect(result.contracts[0]).toMatchObject({ address: TOKEN });
    expect(result.status).toBe('passed');
  });

  it('names call targets from token metadata when quick returns no contracts', async () => {
    const vaultInfo = {
      standard: 'ERC20',
      type: 'Fungible',
      contract_address: TARGET,
      symbol: 'sparkUSDC',
      name: 'Spark USDC Vault',
      decimals: 18,
    };
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response([
          simulationResult({
            id: 'sim-quick',
            to: TARGET,
            contracts: [],
            assetChanges: [
              {
                token_info: tokenInfo,
                type: 'Transfer',
                from: WALLET,
                to: TARGET,
                raw_amount: '10',
              },
              {
                token_info: vaultInfo,
                type: 'Mint',
                to: WALLET,
                raw_amount: '9',
              },
            ],
          }),
        ]),
      )
      .mockResolvedValue({ ok: true, status: 204 });
    const service = createService(fetchFn);

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TARGET }],
    });

    expect(result.contracts).toEqual([
      {
        address: TARGET,
        name: 'Spark USDC Vault',
        callIndexes: [0],
      },
    ]);
  });

  it('leaves a contract unnamed when its token metadata carries no name', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response([
          simulationResult({
            id: 'sim-nameless',
            to: TOKEN,
            contracts: [],
            assetChanges: [
              {
                token_info: partialTokenInfo,
                type: 'Transfer',
                from: WALLET,
                to: TARGET,
                raw_amount: '10',
              },
            ],
          }),
        ]),
      )
      .mockResolvedValue({ ok: true, status: 204 });
    const service = createService(fetchFn);

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TOKEN }],
    });

    expect(result.contracts[0]).toMatchObject({ address: TOKEN, name: null });
  });

  it('uses the injected resolver after Tenderly and token metadata', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response([
          simulationResult({
            id: 'sim-protocol-name',
            to: TARGET,
            contracts: [],
          }),
        ]),
      )
      .mockResolvedValue({ ok: true, status: 204 });
    const resolveContractName = vi.fn().mockReturnValue('Protocol Router');
    const service = createTenderlySimulationService({
      accountSlug: 'account-slug',
      projectSlug: 'project-slug',
      accessToken: 'secret-token',
      fetchFn,
      resolveContractName,
    });

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TARGET }],
    });

    expect(resolveContractName).toHaveBeenCalledWith(TARGET);
    expect(result.contracts).toEqual([
      {
        address: TARGET,
        name: 'Protocol Router',
        callIndexes: [0],
      },
    ]);
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
      .mockResolvedValue({ ok: true, status: 204 });
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
      .mockResolvedValue({ ok: true, status: 204 });
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
      .mockResolvedValue({ ok: true, status: 204 });
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

describe('TenderlySimulationService branch sweep', () => {
  // Each test names the previously-uncovered branch it locks.
  // mutation: not run (offline sandbox — vitest could not be executed here).

  it('locks string gas values normalized through integerString', async () => {
    // Locks: integerString `typeof value === 'number'` false (decimal and
    // 0x-hex digit strings, both admitted by RawIntegerSchema).
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response([
          simulationResult({
            id: 'sim-dec',
            gasUsed: '21000' as unknown as number,
          }),
          simulationResult({
            id: 'sim-hex',
            gasUsed: '0x5208' as unknown as number,
          }),
        ]),
      )
      .mockResolvedValue({ ok: true, status: 204 });
    const service = createService(fetchFn);

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TARGET }, { to: TOKEN }],
    });

    expect(result.callGas).toBe('42000');
    expect(result.calls.map((call) => call.gasUsed)).toEqual([
      '21000',
      '21000',
    ]);
  });

  it('locks an invalid logo URL normalizing to null', async () => {
    // Locks: normalizeLogoUrl catch (`new URL(value)` throws) → null.
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response([
          simulationResult({
            id: 'sim-logo',
            to: TOKEN,
            assetChanges: [
              {
                token_info: { ...tokenInfo, logo: 'not a url' },
                type: 'Transfer',
                from: WALLET,
                to: SPENDER,
                raw_amount: '50',
              },
            ],
            contracts: [contract(TOKEN, { token: true })],
          }),
        ]),
      )
      .mockResolvedValue({ ok: true, status: 204 });
    const service = createService(fetchFn);

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TOKEN }],
    });

    expect(result.assetChanges[0]?.token.logoUrl).toBeNull();
  });

  it('locks skipping the approvals fallback for a decodable non-approve call', async () => {
    // Locks: decodeApproval `decoded.functionName !== 'approve'` true.
    const transferData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [SPENDER, 1n],
    });
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response([
          simulationResult({
            id: 'sim-transfer',
            to: TOKEN,
            method: '',
            contracts: [contract(TOKEN, { token: true })],
          }),
        ]),
      )
      .mockResolvedValue({ ok: true, status: 204 });
    const service = createService(fetchFn);

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TOKEN, data: transferData }],
    });

    expect(result.calls[0]?.method).toBe('transfer');
    expect(result.approvals).toEqual([]);
  });

  it('locks contract-name absence and the first-name-wins guard', async () => {
    // Locks: indexReview `name && !contractNameByAddress.has(address)` — name
    // falsy (null contract_name) and duplicate-address guard true.
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response([
          simulationResult({
            id: 'sim-a',
            contracts: [{ address: TARGET, contract_name: 'First' }],
          }),
          simulationResult({
            id: 'sim-b',
            contracts: [
              { address: TARGET, contract_name: 'Second' },
              { address: TOKEN, contract_name: null },
            ],
          }),
        ]),
      )
      .mockResolvedValue({ ok: true, status: 204 });
    const service = createService(fetchFn);

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TARGET }, { to: TARGET }],
    });

    expect(result.contracts).toEqual([
      { address: TARGET, name: 'First', callIndexes: [0, 1] },
    ]);
  });

  it('locks skipping same-wallet transfers and address-less token metadata', async () => {
    // Locks: `from === walletAddress && to === walletAddress` continue;
    // `if (rawChange.token_info.contract_address)` false; spendByToken
    // `!change.token.address` true.
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response([
          simulationResult({
            id: 'sim-self',
            to: TOKEN,
            assetChanges: [
              {
                token_info: tokenInfo,
                type: 'Transfer',
                from: WALLET,
                to: WALLET,
                raw_amount: '5',
              },
              {
                token_info: {
                  standard: 'ERC20',
                  type: 'Fungible',
                  symbol: 'NN',
                },
                type: 'Transfer',
                from: WALLET,
                to: SPENDER,
                raw_amount: '7',
              },
            ],
            contracts: [contract(TOKEN, { token: true })],
          }),
        ]),
      )
      .mockResolvedValue({ ok: true, status: 204 });
    const service = createService(fetchFn);

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TOKEN }],
    });

    expect(result.assetChanges).toEqual([
      expect.objectContaining({
        direction: 'out',
        rawAmount: '7',
        token: expect.objectContaining({ address: null, symbol: 'NN' }),
      }),
    ]);
  });

  it('locks the halted-call defaults for missing error and block number', async () => {
    // Locks: `transaction?.error_message?.trim() || simulation.error_message?.trim()
    // || 'Simulation reverted'` full fallthrough; `transaction?.status &&
    // simulation.status` second-operand false; `results[0]?.transaction?.block_number
    // ?? null` nullish fallback.
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response([
          {
            transaction: null,
            simulation: {
              id: '',
              status: false,
              gas_used: 0,
              block_number: null,
              error_message: null,
            },
            contracts: [],
          },
          {
            transaction: {
              status: true,
              to: TARGET,
              input: '0x1234',
              gas_used: 21_000,
              block_number: 123,
              method: 'execute',
              error_message: null,
              transaction_info: { asset_changes: [] },
            },
            simulation: {
              id: 'sim-mix',
              status: false,
              gas_used: 21_000,
              block_number: 123,
              method: 'execute',
              error_message: 'boom',
            },
            contracts: [],
          },
        ]),
      )
      .mockResolvedValue({ ok: true, status: 204 });
    const service = createService(fetchFn);

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TARGET }, { to: TARGET }],
    });

    expect(result).toMatchObject({
      status: 'failed',
      failureReason: 'Simulation reverted',
      blockNumber: null,
    });
    expect(result.calls.map((call) => call.status)).toEqual([
      'failed',
      'failed',
    ]);
    expect(result.calls[1]?.error).toBe('boom');
  });

  it('locks an approval that stays within the simulated spend', async () => {
    // Locks: `approval.exceedsSimulatedSpend` false (no warning emitted).
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response([
          simulationResult({
            id: 'sim-covered-approval',
            to: TOKEN,
            method: 'approve',
            assetChanges: [
              {
                token_info: tokenInfo,
                type: 'Transfer',
                from: WALLET,
                to: SPENDER,
                raw_amount: '200',
              },
            ],
            exposureChanges: [
              {
                token_info: tokenInfo,
                type: 'Approve',
                owner: WALLET,
                spender: SPENDER,
                raw_amount: '100',
              },
            ],
            contracts: [contract(TOKEN, { token: true })],
          }),
        ]),
      )
      .mockResolvedValue({ ok: true, status: 204 });
    const service = createService(fetchFn);

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TOKEN }],
    });

    expect(result.approvals).toEqual([
      expect.objectContaining({
        rawAmount: '100',
        simulatedSpendRaw: '200',
        exceedsSimulatedSpend: false,
        unlimited: false,
      }),
    ]);
    expect(result.warnings.map((warning) => warning.code)).not.toContain(
      'APPROVAL_EXCEEDS_SIMULATED_SPEND',
    );
  });

  it('locks the unknown-token fallback for calldata-derived approvals', async () => {
    // Locks: `tokenByAddress.get(tokenAddress) ?? unknownToken(tokenAddress)`
    // fallback in the no-exposure-changes approvals path.
    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [SPENDER, 1n],
    });
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response([
          simulationResult({
            id: 'sim-unknown-token',
            to: TOKEN,
            method: '',
            contracts: [],
          }),
        ]),
      )
      .mockResolvedValue({ ok: true, status: 204 });
    const service = createService(fetchFn);

    const result = await service.simulateBundle({
      chainId: 8453,
      walletAddress: WALLET,
      calls: [{ to: TOKEN, data: approveData }],
    });

    expect(result.approvals[0]?.token).toEqual({
      address: TOKEN,
      symbol: 'UNKNOWN',
      name: 'Unknown token',
      decimals: 0,
      logoUrl: null,
    });
    expect(result.approvals[0]?.amount).toBe('1');
  });

  it('locks rejecting more results than requested calls', async () => {
    // Locks: `results.length > input.calls.length` true → malformed.
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        response([
          simulationResult({ id: 'sim-1' }),
          simulationResult({ id: 'sim-2' }),
        ]),
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

  it('locks the non-Error parse failure path', async () => {
    // Locks: `err instanceof Error ? err.message : String(err)` false outcome.
    const fetchFn = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- deliberately a non-Error rejection, the subject under test
      json: () => Promise.reject('plain string failure'),
    });
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
});
