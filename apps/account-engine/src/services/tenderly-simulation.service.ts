import type {
  ExecutionSimulationApproval,
  ExecutionSimulationAssetChange,
  ExecutionSimulationCall,
  ExecutionSimulationContract,
  ExecutionSimulationToken,
  ExecutionSimulationWarning,
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

import { Logger } from '../common/logger';
import { getErrorMessage } from '../common/utils';

const TENDERLY_API_URL = 'https://api.tenderly.co/api/v1';
// Heavy bundles (GMX basket: up to ~8 full-decode simulations) routinely
// exceed 10s. Share links stay on a short budget because they are best-effort
// and the whole review must fit the client's 60s request window.
const TENDERLY_SIMULATE_TIMEOUT_MS = 30_000;
const TENDERLY_SHARE_TIMEOUT_MS = 10_000;
const TENDERLY_CALL_GAS_LIMIT = 8_000_000;
const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

const RawIntegerSchema = z.union([
  z.number().int().nonnegative(),
  z.string().regex(/^\d+$/),
  z.string().regex(/^0x[0-9a-fA-F]+$/),
]);

const RawAmountSchema = z.union([
  z.string().min(1),
  z.number().int().nonnegative(),
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
    raw_amount: RawAmountSchema,
    amount: z.string().optional(),
  })
  .passthrough();

const RawExposureChangeSchema = z
  .object({
    token_info: RawTokenInfoSchema,
    type: z.string().min(1),
    owner: z.string().regex(ADDRESS_REGEX),
    spender: z.string().regex(ADDRESS_REGEX),
    raw_amount: RawAmountSchema,
    amount: z.string().optional(),
  })
  .passthrough();

// No bytecode-verification signal is read here on purpose. 'quick' simulations
// omit `contracts` entirely, and this Tenderly project reports an empty
// `verified_by` even on 'full' — which the 256MB production instance cannot
// parse anyway. Treating that silence as "unverified" flagged every call in
// every review. Verification would have to come from a dedicated source, and
// only the service may derive it: warnings are hashed into `riskHash`, which a
// second rail recomputes and the client compares before signing.
const RawContractSchema = z
  .object({
    address: z.string().regex(ADDRESS_REGEX),
    contract_name: z.string().optional().nullable(),
    token_data: RawTokenInfoSchema.optional(),
  })
  .passthrough();

// When a bundled call is invalid rather than reverting (e.g. the wallet cannot
// cover value + gas), Tenderly halts and returns a stub entry: transaction is
// null, simulation.id is empty, block_number is null, and the reason lives on
// simulation.error_message.
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
            asset_changes: z.array(RawAssetChangeSchema).nullable().default([]),
            exposure_changes: z
              .array(RawExposureChangeSchema)
              .nullable()
              .default([]),
          })
          .passthrough(),
      })
      .passthrough()
      .nullable(),
    simulation: z
      .object({
        id: z.string(),
        status: z.union([z.boolean(), z.number()]),
        gas_used: RawIntegerSchema,
        block_number: z.number().int().nonnegative().nullable(),
        method: z.string().optional().nullable(),
        error_message: z.string().optional().nullable(),
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
  calls: ExecutionSimulationCall[];
  assetChanges: ExecutionSimulationAssetChange[];
  approvals: ExecutionSimulationApproval[];
  contracts: ExecutionSimulationContract[];
  warnings: ExecutionSimulationWarning[];
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
    calls: TenderlySimulationCall[];
  }): Promise<TenderlySimulationReview>;
}

/**
 * Names the function calldata invokes when the ERC-20 ABI cannot. Injected by
 * the composition root from the module that owns the protocol ABIs, keeping
 * protocol knowledge out of the identity plane. One instance of this service
 * backs both the review rail and the execution-preview rail, so a single
 * decoder is what keeps their warnings — and therefore the risk hash the client
 * compares before signing — identical.
 */
type SimulationMethodDecoder = (data: `0x${string}`) => string | null;
type SimulationContractNameResolver = (address: string) => string | null;

/** A wallet-neutral call accepted by the rich Tenderly normalizer. */
export interface TenderlySimulationCall {
  to: string;
  data?: string;
  /** Decimal or hex quantity; the normalizer canonicalizes it to decimal. */
  value?: string;
}

interface TenderlyLogger {
  warn(message: string, meta: unknown): void;
}

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

function integerString(value: number | string): string {
  if (typeof value === 'number') {
    return value.toString();
  }
  try {
    return BigInt(value).toString();
  } catch {
    return value;
  }
}

function parseRawAmount(value: number | string): bigint {
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

function normalizeToken(token: RawTokenInfo): ExecutionSimulationToken {
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

function unknownToken(address: string): ExecutionSimulationToken {
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

function skippedCall(
  call: TenderlySimulationCall,
  index: number,
  decodeProtocolMethod: SimulationMethodDecoder | undefined,
): ExecutionSimulationCall {
  return {
    index,
    to: normalizeAddress(call.to),
    data: call.data ?? '0x',
    value: BigInt(call.value ?? '0x0').toString(),
    // A call Tenderly never reached is still nameable: the method is decoded
    // from the calldata we built, not reported by the simulation.
    method: methodFromCall(call, null, decodeProtocolMethod),
    status: 'skipped',
    gasUsed: null,
    error: null,
  };
}

function unavailableReview(
  input: Parameters<TenderlySimulationService['simulateBundle']>[0],
  reason: string,
  decodeProtocolMethod: SimulationMethodDecoder | undefined,
): TenderlySimulationReview {
  const calls = input.calls.map((call, index) =>
    skippedCall(call, index, decodeProtocolMethod),
  );
  const warnings: ExecutionSimulationWarning[] = [];
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

// 'quick' simulations report no decoded method (transaction.method and
// simulation.method are both null), so every name below comes from decoding the
// calldata we sent ourselves.
function methodFromCall(
  call: TenderlySimulationCall,
  tenderlyMethod: string | null | undefined,
  decodeProtocolMethod: SimulationMethodDecoder | undefined,
): string | null {
  const trimmed = tenderlyMethod?.trim();
  if (trimmed) return trimmed;

  const data = (call.data ?? '0x') as `0x${string}`;
  try {
    return decodeFunctionData({ abi: erc20Abi, data }).functionName;
  } catch {
    return decodeProtocolMethod?.(data) ?? null;
  }
}

function decodeApproval(
  call: TenderlySimulationCall,
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

function walletDirection(
  from: string | null,
  to: string | null,
  walletAddress: string,
): 'in' | 'out' | null {
  if (from === walletAddress) return 'out';
  if (to === walletAddress) return 'in';
  return null;
}

interface ReviewIndex {
  /** Tenderly's own label per contract, when it reports one. */
  contractNameByAddress: Map<string, string>;
  tokenByAddress: Map<string, ExecutionSimulationToken>;
  /**
   * On-chain `name()` per token contract. Kept apart from `tokenByAddress`
   * because `normalizeToken` substitutes a placeholder for nameless tokens,
   * and a placeholder must never be shown as a contract's display name.
   */
  tokenNameByAddress: Map<string, string>;
}

function indexReview(results: RawSimulationResult[]): ReviewIndex {
  const contractNameByAddress = new Map<string, string>();
  const tokenByAddress = new Map<string, ExecutionSimulationToken>();
  const tokenNameByAddress = new Map<string, string>();

  const rememberToken = (address: string, rawToken: RawTokenInfo) => {
    tokenByAddress.set(address, normalizeToken(rawToken));
    const name = rawToken.name?.trim();
    if (name) tokenNameByAddress.set(address, name);
  };

  for (const result of results) {
    for (const rawContract of result.contracts) {
      const address = normalizeAddress(rawContract.address);
      const name = rawContract.contract_name?.trim();
      if (name && !contractNameByAddress.has(address)) {
        contractNameByAddress.set(address, name);
      }
      if (rawContract.token_data) {
        rememberToken(address, rawContract.token_data);
      }
    }
    for (const rawChange of result.transaction?.transaction_info
      .asset_changes ?? []) {
      if (rawChange.token_info.contract_address) {
        rememberToken(
          normalizeAddress(rawChange.token_info.contract_address),
          rawChange.token_info,
        );
      }
    }
    for (const exposure of result.transaction?.transaction_info
      .exposure_changes ?? []) {
      if (exposure.token_info.contract_address) {
        rememberToken(
          normalizeAddress(exposure.token_info.contract_address),
          exposure.token_info,
        );
      }
    }
  }

  return { contractNameByAddress, tokenByAddress, tokenNameByAddress };
}

// This pipeline derives calls, assets, approvals, and warnings from shared evidence.
// eslint-disable-next-line sonarjs/cognitive-complexity
function normalizeReview(
  input: Parameters<TenderlySimulationService['simulateBundle']>[0],
  results: RawSimulationResult[],
  shareUrls: string[],
  decodeProtocolMethod: SimulationMethodDecoder | undefined,
  resolveContractName: SimulationContractNameResolver | undefined,
): TenderlySimulationReview {
  const walletAddress = normalizeAddress(input.walletAddress);
  const { contractNameByAddress, tokenByAddress, tokenNameByAddress } =
    indexReview(results);

  const calls: ExecutionSimulationCall[] = input.calls.map((call, index) => {
    const result = results[index];
    const target = normalizeAddress(call.to);
    if (!result) {
      return skippedCall(call, index, decodeProtocolMethod);
    }

    const succeeded = Boolean(
      result.transaction?.status && result.simulation.status,
    );
    return {
      index,
      to: target,
      data: call.data ?? '0x',
      value: BigInt(call.value ?? '0x0').toString(),
      method: methodFromCall(
        call,
        result.transaction?.method ?? result.simulation.method,
        decodeProtocolMethod,
      ),
      status: succeeded ? 'succeeded' : 'failed',
      gasUsed: integerString(
        result.transaction?.gas_used ?? result.simulation.gas_used,
      ),
      error: succeeded
        ? null
        : result.transaction?.error_message?.trim() ||
          result.simulation.error_message?.trim() ||
          'Simulation reverted',
    };
  });

  const assetChanges: ExecutionSimulationAssetChange[] = [];
  for (const [callIndex, result] of results.entries()) {
    for (const rawChange of result.transaction?.transaction_info
      .asset_changes ?? []) {
      const from = rawChange.from ? normalizeAddress(rawChange.from) : null;
      const to = rawChange.to ? normalizeAddress(rawChange.to) : null;
      if (from === walletAddress && to === walletAddress) continue;
      const direction = walletDirection(from, to, walletAddress);
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

  const approvals: ExecutionSimulationApproval[] = [];
  for (const [callIndex, result] of results.entries()) {
    const exposureChanges =
      result.transaction?.transaction_info.exposure_changes ?? [];
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

  const callIndexesByAddress = new Map<string, number[]>();
  for (const call of calls) {
    const callIndexes = callIndexesByAddress.get(call.to) ?? [];
    callIndexes.push(call.index);
    callIndexesByAddress.set(call.to, callIndexes);
  }
  const contracts: ExecutionSimulationContract[] = Array.from(
    callIndexesByAddress,
    ([address, callIndexes]) => ({
      address,
      // 'quick' simulations return no contract metadata at all, so the token
      // registry Tenderly attaches to asset/exposure changes is the only
      // remaining name source. It reports the target's own on-chain `name()`,
      // which covers every token and ERC-4626 vault the bundle touches.
      name:
        contractNameByAddress.get(address) ??
        tokenNameByAddress.get(address) ??
        resolveContractName?.(address) ??
        null,
      callIndexes,
    }),
  );

  const warnings: ExecutionSimulationWarning[] = [];
  const approvalsByCall = new Map<number, ExecutionSimulationApproval[]>();
  for (const approval of approvals) {
    const existing = approvalsByCall.get(approval.callIndex) ?? [];
    existing.push(approval);
    approvalsByCall.set(approval.callIndex, existing);
  }
  for (const call of calls) {
    const callApprovals = approvalsByCall.get(call.index) ?? [];
    for (const approval of callApprovals) {
      if (approval.unlimited) {
        warnings.push({
          code: 'UNLIMITED_APPROVAL',
          message: `Call ${call.index + 1}: ${approval.token.symbol} grants unlimited approval to ${approval.spender}`,
          callIndex: call.index,
          address: approval.spender,
        });
      }
      if (approval.exceedsSimulatedSpend) {
        warnings.push({
          code: 'APPROVAL_EXCEEDS_SIMULATED_SPEND',
          message: `Call ${call.index + 1}: ${approval.token.symbol} approval exceeds simulated spend`,
          callIndex: call.index,
          address: approval.spender,
        });
      }
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
    blockNumber: results[0]?.transaction?.block_number ?? null,
    callGas: results
      .reduce(
        (total, result) =>
          total +
          BigInt(
            integerString(
              result.transaction?.gas_used ?? result.simulation.gas_used,
            ),
          ),
        0n,
      )
      .toString(),
    simulationIds: results
      .map((result) => result.simulation.id)
      .filter((id) => id.length > 0),
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
  decodeProtocolMethod?: SimulationMethodDecoder;
  resolveContractName?: SimulationContractNameResolver;
}): TenderlySimulationService {
  const fetchFn = config.fetchFn ?? fetch;
  const logger = config.logger ?? new Logger('TenderlySimulation');

  async function fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
          config.decodeProtocolMethod,
        );
      }

      const baseUrl = `${TENDERLY_API_URL}/account/${accountSlug}/project/${projectSlug}`;
      const headers = {
        'Content-Type': 'application/json',
        'X-Access-Key': accessToken,
      };

      let response: Response;
      const startedAt = Date.now();
      try {
        response = await fetchWithTimeout(
          `${baseUrl}/simulate-bundle`,
          {
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
                // 'quick' keeps everything the normalizer consumes (statuses,
                // asset/exposure changes, simulation ids). 'full'/'abi' only
                // add per-call traces and contract metadata, which reach
                // >100MB on GMX basket bundles — more than the 256MB
                // production instance can parse.
                simulation_type: 'quick',
              })),
            }),
          },
          TENDERLY_SIMULATE_TIMEOUT_MS,
        );
      } catch (error) {
        logger.warn('Tenderly simulate-bundle failed', {
          chainId: input.chainId,
          callCount: input.calls.length,
          durationMs: Date.now() - startedAt,
          error: getErrorMessage(error),
        });
        return unavailableReview(
          input,
          error instanceof DOMException && error.name === 'AbortError'
            ? 'Tenderly simulation timed out'
            : `Tenderly simulation unavailable: ${getErrorMessage(error)}`,
          config.decodeProtocolMethod,
        );
      }

      if (!response.ok) {
        return unavailableReview(
          input,
          `Tenderly simulation returned HTTP ${response.status}`,
          config.decodeProtocolMethod,
        );
      }

      let parsed: z.infer<typeof RawBundleResponseSchema>;
      try {
        parsed = RawBundleResponseSchema.parse(await response.json());
        const results = parsed.simulation_results;
        const lastResult = results.at(-1);
        const stoppedAfterFailure =
          results.length < input.calls.length &&
          lastResult !== undefined &&
          !(lastResult.transaction?.status && lastResult.simulation.status);
        if (
          results.length > input.calls.length ||
          (results.length < input.calls.length && !stoppedAfterFailure)
        ) {
          throw new Error(
            `Tenderly returned ${results.length} results for ${input.calls.length} calls`,
          );
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.warn('Tenderly parse error', { error: errorMsg });
        return unavailableReview(
          input,
          'Tenderly returned malformed simulation data',
          config.decodeProtocolMethod,
        );
      }

      const shareUrls = (
        await Promise.all(
          parsed.simulation_results.map(async (result) => {
            const simulationId = result.simulation.id;
            if (!simulationId) return null;
            try {
              const shareResponse = await fetchWithTimeout(
                `${baseUrl}/simulations/${simulationId}/share`,
                { method: 'POST', headers },
                TENDERLY_SHARE_TIMEOUT_MS,
              );
              if (!shareResponse.ok) {
                logger.warn('Tenderly simulation sharing failed', {
                  simulationId,
                  status: shareResponse.status,
                });
                return null;
              }
              return `https://www.tdly.co/shared/simulation/${simulationId}`;
            } catch (error) {
              logger.warn('Tenderly simulation sharing failed', {
                simulationId,
                error: getErrorMessage(error),
              });
              return null;
            }
          }),
        )
      ).filter((url): url is string => url !== null);

      return normalizeReview(
        input,
        parsed.simulation_results,
        shareUrls,
        config.decodeProtocolMethod,
        config.resolveContractName,
      );
    },
  };
}
