import type {
  PrivyPrepareSendCallsRequest,
  PrivySimulationApproval,
  PrivySimulationAssetChange,
  PrivySimulationCall,
  PrivySimulationContract,
  PrivySimulationToken,
  PrivySimulationWarning,
} from '@zapengine/types/api';
import {
  decodeFunctionData,
  erc20Abi,
  formatUnits,
  keccak256,
  maxUint256,
  toBytes,
} from 'viem';
import { z } from 'zod';

import { writeFileSync } from 'node:fs';

import { Logger } from '../common/logger';
import { getErrorMessage } from '../common/utils';

const TENDERLY_API_URL = 'https://api.tenderly.co/api/v1';
const TENDERLY_SHARE_URL = 'https://www.tdly.co/shared/simulation';
const TENDERLY_TIMEOUT_MS = 10_000;
const TENDERLY_CALL_GAS_LIMIT = 8_000_000;
const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

const RawIntegerSchema = z.union([
  z.number().int().nonnegative(),
  z.string().regex(/^\d+$/),
  z.string().regex(/^0x[0-9a-fA-F]+$/),
]);

const RawTokenInfoSchema = z
  .object({
    contract_address: z.string().regex(ADDRESS_REGEX).optional(),
    symbol: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    decimals: z.number().int().min(0).max(255).optional(),
    logo: z.string().optional().nullable(),
  })
  .passthrough();

const RawAssetChangeSchema = z
  .object({
    token_info: RawTokenInfoSchema,
    type: z.string().min(1),
    from: z.string().regex(ADDRESS_REGEX).optional().nullable(),
    to: z.string().regex(ADDRESS_REGEX).optional().nullable(),
    raw_amount: z.union([z.string().min(1), z.number().int().nonnegative()]),
    amount: z.string().optional(),
  })
  .passthrough();

const RawExposureChangeSchema = z
  .object({
    token_info: RawTokenInfoSchema,
    type: z.string().min(1),
    owner: z.string().regex(ADDRESS_REGEX),
    spender: z.string().regex(ADDRESS_REGEX),
    raw_amount: z.union([z.string().min(1), z.number().int().nonnegative()]),
    amount: z.string().optional(),
  })
  .passthrough();

const RawContractSchema = z
  .object({
    address: z.string().regex(ADDRESS_REGEX),
    contract_name: z.string().optional().nullable(),
    verified_by: z.string().optional().nullable(),
    token_data: RawTokenInfoSchema.optional(),
  })
  .passthrough();

const RawSimulationResultSchema = z
  .object({
    transaction: z
      .object({
        status: z.union([z.boolean(), z.number()]),
        to: z.string().regex(ADDRESS_REGEX).optional(),
        input: z.string().optional(),
        gas_used: RawIntegerSchema,
        block_number: z.number().int().nonnegative(),
        method: z.string().optional().nullable(),
        error_message: z.string().optional().nullable(),
        transaction_info: z
          .object({
            asset_changes: z
              .array(RawAssetChangeSchema)
              .nullable()
              .default([]),
            exposure_changes: z
              .array(RawExposureChangeSchema)
              .nullable()
              .default([]),
          })
          .passthrough(),
      })
      .passthrough(),
    simulation: z
      .object({
        id: z.string().min(1),
        status: z.union([z.boolean(), z.number()]),
        gas_used: RawIntegerSchema,
        block_number: z.number().int().nonnegative(),
        method: z.string().optional().nullable(),
      })
      .passthrough(),
    contracts: z.array(RawContractSchema).default([]),
  })
  .passthrough();

const RawBundleResponseSchema = z
  .object({
    simulation_results: z.array(RawSimulationResultSchema).min(1),
  })
  .passthrough();

type RawSimulationResult = z.infer<typeof RawSimulationResultSchema>;
type RawTokenInfo = z.infer<typeof RawTokenInfoSchema>;

interface ReviewEvidence {
  chainId: 8453 | 42161;
  walletAddress: string;
  calls: PrivySimulationCall[];
  assetChanges: PrivySimulationAssetChange[];
  approvals: PrivySimulationApproval[];
  contracts: PrivySimulationContract[];
  warnings: PrivySimulationWarning[];
  blockNumber: number | null;
  callGas: string;
  simulationIds: string[];
  shareUrls: string[];
  simulationFingerprint: `0x${string}`;
  riskHash: `0x${string}`;
}

export type TenderlySimulationReview =
  | ({ status: 'passed' | 'warning' } & ReviewEvidence)
  | ({ status: 'failed'; failureReason: string } & ReviewEvidence)
  | ({ status: 'unavailable'; unavailableReason: string } & ReviewEvidence);

export interface TenderlySimulationService {
  simulateBundle(input: {
    chainId: 8453 | 42161;
    walletAddress: string;
    calls: PrivyPrepareSendCallsRequest['calls'];
  }): Promise<TenderlySimulationReview>;
}

interface TenderlyLogger {
  warn(message: string, meta: unknown): void;
}

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

function integerString(value: number | string): string {
  return typeof value === 'number' ? value.toString() : value;
}

function parseRawAmount(value: number | string): bigint {
  if (typeof value === 'number') {
    return BigInt(value);
  }
  return BigInt(value);
}

function normalizeLogoUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

function normalizeToken(token: RawTokenInfo): PrivySimulationToken {
  return {
    address: token.contract_address
      ? normalizeAddress(token.contract_address)
      : null,
    symbol: token.symbol ?? 'UNKNOWN',
    name: token.name ?? 'Unknown token',
    decimals: token.decimals ?? 0,
    logoUrl: normalizeLogoUrl(token.logo),
  };
}

function unknownToken(address: string): PrivySimulationToken {
  return {
    address: normalizeAddress(address),
    symbol: 'UNKNOWN',
    name: 'Unknown token',
    decimals: 0,
    logoUrl: null,
  };
}

function hashMaterial(value: unknown): `0x${string}` {
  return keccak256(toBytes(JSON.stringify(value)));
}

function emptyCalls(
  calls: PrivyPrepareSendCallsRequest['calls'],
): PrivySimulationCall[] {
  return calls.map((call, index) => ({
    index,
    to: normalizeAddress(call.to),
    data: call.data ?? '0x',
    value: BigInt(call.value ?? '0x0').toString(),
    method: null,
    status: 'skipped',
    gasUsed: null,
    error: null,
    contractVerified: false,
  }));
}

function unavailableReview(
  input: Parameters<TenderlySimulationService['simulateBundle']>[0],
  reason: string,
): TenderlySimulationReview {
  const calls = emptyCalls(input.calls);
  const warnings: PrivySimulationWarning[] = [];
  return {
    status: 'unavailable',
    unavailableReason: reason,
    chainId: input.chainId,
    walletAddress: normalizeAddress(input.walletAddress),
    calls,
    assetChanges: [],
    approvals: [],
    contracts: [],
    warnings,
    blockNumber: null,
    callGas: '0',
    simulationIds: [],
    shareUrls: [],
    simulationFingerprint: hashMaterial({ status: 'unavailable' }),
    riskHash: hashMaterial(warnings),
  };
}

function methodFromCall(
  call: PrivyPrepareSendCallsRequest['calls'][number],
  tenderlyMethod: string | null | undefined,
): string | null {
  const trimmed = tenderlyMethod?.trim();
  if (trimmed) return trimmed;

  try {
    return decodeFunctionData({
      abi: erc20Abi,
      data: (call.data ?? '0x') as `0x${string}`,
    }).functionName;
  } catch {
    return null;
  }
}

function decodeApproval(
  call: PrivyPrepareSendCallsRequest['calls'][number],
): { spender: string; amount: bigint } | null {
  try {
    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data: (call.data ?? '0x') as `0x${string}`,
    });
    if (decoded.functionName !== 'approve') return null;
    const [spender, amount] = decoded.args;
    return { spender: normalizeAddress(spender), amount };
  } catch {
    return null;
  }
}

function contractIsVerified(
  contract: z.infer<typeof RawContractSchema>,
): boolean {
  return Boolean(contract.verified_by?.trim());
}

function normalizeReview(
  input: Parameters<TenderlySimulationService['simulateBundle']>[0],
  results: RawSimulationResult[],
  shareUrls: string[],
): TenderlySimulationReview {
  const walletAddress = normalizeAddress(input.walletAddress);
  const contractsByAddress = new Map<
    string,
    z.infer<typeof RawContractSchema>
  >();
  const tokenByAddress = new Map<string, PrivySimulationToken>();

  for (const result of results) {
    for (const rawContract of result.contracts) {
      const address = normalizeAddress(rawContract.address);
      const existing = contractsByAddress.get(address);
      if (!existing || contractIsVerified(rawContract)) {
        contractsByAddress.set(address, rawContract);
      }
      if (rawContract.token_data) {
        tokenByAddress.set(address, normalizeToken(rawContract.token_data));
      }
    }
    for (const rawChange of result.transaction.transaction_info.asset_changes ?? []) {
      if (rawChange.token_info.contract_address) {
        tokenByAddress.set(
          normalizeAddress(rawChange.token_info.contract_address),
          normalizeToken(rawChange.token_info),
        );
      }
    }
    for (const exposure of result.transaction.transaction_info.exposure_changes ?? []) {
      if (exposure.token_info.contract_address) {
        tokenByAddress.set(
          normalizeAddress(exposure.token_info.contract_address),
          normalizeToken(exposure.token_info),
        );
      }
    }
  }

  const calls: PrivySimulationCall[] = input.calls.map((call, index) => {
    const result = results[index];
    const target = normalizeAddress(call.to);
    const rawContract = contractsByAddress.get(target);
    if (!result) {
      return {
        index,
        to: target,
        data: call.data ?? '0x',
        value: BigInt(call.value ?? '0x0').toString(),
        method: null,
        status: 'skipped',
        gasUsed: null,
        error: null,
        contractVerified: Boolean(
          rawContract && contractIsVerified(rawContract),
        ),
      };
    }

    const succeeded = result.transaction.status && result.simulation.status;
    return {
      index,
      to: target,
      data: call.data ?? '0x',
      value: BigInt(call.value ?? '0x0').toString(),
      method: methodFromCall(
        call,
        result.transaction.method ?? result.simulation.method,
      ),
      status: succeeded ? 'succeeded' : 'failed',
      gasUsed: integerString(result.transaction.gas_used),
      error: succeeded
        ? null
        : result.transaction.error_message?.trim() || 'Simulation reverted',
      contractVerified: Boolean(rawContract && contractIsVerified(rawContract)),
    };
  });

  const assetChanges: PrivySimulationAssetChange[] = [];
  for (const [callIndex, result] of results.entries()) {
    for (const rawChange of result.transaction.transaction_info.asset_changes ?? []) {
      const from = rawChange.from ? normalizeAddress(rawChange.from) : null;
      const to = rawChange.to ? normalizeAddress(rawChange.to) : null;
      if (from === walletAddress && to === walletAddress) continue;
      const direction =
        from === walletAddress ? 'out' : to === walletAddress ? 'in' : null;
      if (!direction) continue;
      const rawAmount = parseRawAmount(rawChange.raw_amount);
      const token = normalizeToken(rawChange.token_info);
      assetChanges.push({
        callIndex,
        direction,
        type: rawChange.type,
        from,
        to,
        token,
        rawAmount: rawAmount.toString(),
        amount: formatUnits(rawAmount, token.decimals),
      });
    }
  }

  const spendByToken = new Map<string, bigint>();
  for (const change of assetChanges) {
    if (change.direction !== 'out' || !change.token.address) continue;
    spendByToken.set(
      change.token.address,
      (spendByToken.get(change.token.address) ?? 0n) + BigInt(change.rawAmount),
    );
  }

  const approvals: PrivySimulationApproval[] = [];
  for (const [callIndex, result] of results.entries()) {
    const exposureChanges = result.transaction.transaction_info.exposure_changes ?? [];
    if (exposureChanges.length > 0) {
      for (const exposure of exposureChanges) {
        const tokenAddress = normalizeAddress(
          exposure.token_info.contract_address ?? '',
        );
        const token =
          tokenByAddress.get(tokenAddress) ??
          normalizeToken(exposure.token_info);
        const rawAmount = parseRawAmount(exposure.raw_amount);
        const simulatedSpend = spendByToken.get(tokenAddress) ?? 0n;
        approvals.push({
          callIndex,
          owner: normalizeAddress(exposure.owner),
          spender: normalizeAddress(exposure.spender),
          token,
          rawAmount: rawAmount.toString(),
          amount: formatUnits(rawAmount, token.decimals),
          unlimited: rawAmount === maxUint256,
          simulatedSpendRaw: simulatedSpend.toString(),
          exceedsSimulatedSpend: rawAmount > simulatedSpend,
        });
      }
    } else {
      const call = input.calls[callIndex];
      if (!call) continue;
      const approval = decodeApproval(call);
      if (!approval) continue;
      const tokenAddress = normalizeAddress(call.to);
      const token =
        tokenByAddress.get(tokenAddress) ?? unknownToken(tokenAddress);
      const simulatedSpend = spendByToken.get(tokenAddress) ?? 0n;
      approvals.push({
        callIndex,
        owner: walletAddress,
        spender: approval.spender,
        token,
        rawAmount: approval.amount.toString(),
        amount: formatUnits(approval.amount, token.decimals),
        unlimited: approval.amount === maxUint256,
        simulatedSpendRaw: simulatedSpend.toString(),
        exceedsSimulatedSpend: approval.amount > simulatedSpend,
      });
    }
  }

  const contracts: PrivySimulationContract[] = Array.from(
    new Set(input.calls.map((call) => normalizeAddress(call.to))),
  ).map((address) => {
    const rawContract = contractsByAddress.get(address);
    return {
      address,
      name: rawContract?.contract_name?.trim() || null,
      verified: Boolean(rawContract && contractIsVerified(rawContract)),
      callIndexes: calls
        .filter((call) => call.to === address)
        .map((call) => call.index),
    };
  });

  const warnings: PrivySimulationWarning[] = [];
  for (const call of calls) {
    if (!call.contractVerified) {
      warnings.push({
        code: 'UNVERIFIED_CONTRACT',
        message: `Call ${call.index + 1} targets an unverified contract`,
        callIndex: call.index,
        address: call.to,
      });
    }
    const approval = approvals.find(
      (candidate) => candidate.callIndex === call.index,
    );
    if (approval?.unlimited) {
      warnings.push({
        code: 'UNLIMITED_APPROVAL',
        message: `Call ${call.index + 1} grants an unlimited token approval`,
        callIndex: call.index,
        address: approval.spender,
      });
    }
    if (approval?.exceedsSimulatedSpend) {
      warnings.push({
        code: 'APPROVAL_EXCEEDS_SIMULATED_SPEND',
        message: `Call ${call.index + 1} approves more than the simulated spend`,
        callIndex: call.index,
        address: approval.spender,
      });
    }
    if (!call.method) {
      warnings.push({
        code: 'UNDECODED_METHOD',
        message: `Call ${call.index + 1} method could not be decoded`,
        callIndex: call.index,
        address: call.to,
      });
    }
  }

  const failedCall = calls.find((call) => call.status === 'failed');
  const successStatus: 'passed' | 'warning' =
    warnings.length > 0 ? 'warning' : 'passed';
  const status = failedCall ? 'failed' : successStatus;
  const material = { status, assetChanges, approvals, warnings };
  const evidence: ReviewEvidence = {
    chainId: input.chainId,
    walletAddress,
    calls,
    assetChanges,
    approvals,
    contracts,
    warnings,
    blockNumber: results[0]?.transaction.block_number ?? null,
    callGas: results
      .reduce(
        (total, result) =>
          total + BigInt(integerString(result.transaction.gas_used)),
        0n,
      )
      .toString(),
    simulationIds: results.map((result) => result.simulation.id),
    shareUrls,
    simulationFingerprint: hashMaterial(material),
    riskHash: hashMaterial(warnings),
  };

  return failedCall
    ? {
        status: 'failed',
        failureReason: failedCall.error ?? 'Simulation reverted',
        ...evidence,
      }
    : { status: successStatus, ...evidence };
}

export function createTenderlySimulationService(config: {
  accountSlug?: string;
  projectSlug?: string;
  accessToken?: string;
  fetchFn?: typeof fetch;
  logger?: TenderlyLogger;
}): TenderlySimulationService {
  const fetchFn = config.fetchFn ?? fetch;
  const logger = config.logger ?? new Logger('TenderlySimulation');

  async function fetchWithTimeout(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TENDERLY_TIMEOUT_MS);
    try {
      return await fetchFn(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async simulateBundle(input) {
      const { accountSlug, projectSlug, accessToken } = config;
      if (!accountSlug || !projectSlug || !accessToken) {
        return unavailableReview(
          input,
          'Tenderly simulation is not configured',
        );
      }

      const baseUrl = `${TENDERLY_API_URL}/account/${accountSlug}/project/${projectSlug}`;
      const headers = {
        'Content-Type': 'application/json',
        'X-Access-Key': accessToken,
      };

      let response: Response;
      try {
        response = await fetchWithTimeout(`${baseUrl}/simulate-bundle`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            simulations: input.calls.map((call) => ({
              network_id: input.chainId.toString(),
              from: input.walletAddress,
              to: call.to,
              input: call.data ?? '0x',
              value: BigInt(call.value ?? '0x0').toString(),
              gas: TENDERLY_CALL_GAS_LIMIT,
              save: true,
              save_if_fails: true,
              simulation_type: 'full',
            })),
          }),
        });
      } catch (error) {
        return unavailableReview(
          input,
          error instanceof DOMException && error.name === 'AbortError'
            ? 'Tenderly simulation timed out'
            : `Tenderly simulation unavailable: ${getErrorMessage(error)}`,
        );
      }

      if (!response.ok) {
        return unavailableReview(
          input,
          `Tenderly simulation returned HTTP ${response.status}`,
        );
      }

      let parsed: z.infer<typeof RawBundleResponseSchema>;
      let rawJson: unknown;
      try {
        rawJson = await response.json();
        parsed = RawBundleResponseSchema.parse(rawJson);
        if (parsed.simulation_results.length > input.calls.length) {
          throw new Error('Tenderly returned more results than calls');
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.warn('Tenderly parse error', { error: errorMsg });
        try {
          writeFileSync(
            '/tmp/tenderly-response.json',
            JSON.stringify(rawJson, null, 2),
          );
          logger.warn('Raw Tenderly response saved to /tmp/tenderly-response.json', {});
        } catch (writeErr) {
          logger.warn('Failed to dump Tenderly response to file', {
            error: getErrorMessage(writeErr),
          });
        }
        return unavailableReview(
          input,
          'Tenderly returned malformed simulation data',
        );
      }

      const shareUrls: string[] = [];
      await Promise.all(
        parsed.simulation_results.map(async (result) => {
          const simulationId = result.simulation.id;
          try {
            const shareResponse = await fetchWithTimeout(
              `${baseUrl}/simulations/${simulationId}/share`,
              { method: 'POST', headers },
            );
            if (!shareResponse.ok) {
              throw new Error(`Tenderly returned HTTP ${shareResponse.status}`);
            }
            shareUrls.push(`${TENDERLY_SHARE_URL}/${simulationId}`);
          } catch (error) {
            logger.warn('Failed to share Tenderly simulation', {
              simulationId,
              error: getErrorMessage(error),
            });
          }
        }),
      );

      return normalizeReview(
        input,
        parsed.simulation_results,
        shareUrls.sort(),
      );
    },
  };
}
