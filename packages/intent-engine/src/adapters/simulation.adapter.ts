import { z } from 'zod';

import type { PreparedTransaction } from '../types/transaction.types.js';

// ---------------------------------------------------------------------------
// Bundle simulation — the fail-closed gate contract used by
// plan hosts. Deliberately a pass/fail verdict, not a review payload: rich
// asset-diff evidence stays on the execution rail's own simulation service.
// ---------------------------------------------------------------------------

export interface BundleSimulationRequest {
  chainId: number;
  from: string;
  calls: Array<Pick<PreparedTransaction, 'to' | 'data' | 'value'>>;
}

export type BundleSimulationResult =
  | { status: 'passed' }
  | { status: 'failed'; reason: string }
  | { status: 'unavailable'; reason: string };

export interface BundleSimulationAdapter {
  simulateBundle(
    request: BundleSimulationRequest,
  ): Promise<BundleSimulationResult>;
}

export interface TenderlyBundleConfig {
  accountSlug: string;
  projectSlug: string;
  accessKey: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

const TENDERLY_API_URL = 'https://api.tenderly.co/api/v1';
// Heavy bundles (e.g. the GMX basket's ~8 full-decode simulations) routinely
// exceed 10s; keep this aligned with the rich review rail's simulate budget.
const DEFAULT_TIMEOUT_MS = 30_000;
const CALL_GAS_LIMIT = 8_000_000;

const SimulatedCallStatus = z.object({
  status: z.union([z.boolean(), z.number()]),
  error_message: z.string().optional().nullable(),
});

// When a bundled call is invalid rather than reverting (e.g. the wallet cannot
// cover value + gas), Tenderly halts and returns a stub entry with a null
// transaction and the reason on simulation.error_message.
const ResultsSchema = z.object({
  simulation_results: z
    .array(
      z
        .object({
          transaction: SimulatedCallStatus.loose().nullable(),
          simulation: SimulatedCallStatus.loose(),
        })
        .loose(),
    )
    .min(1),
});

/**
 * Real Tenderly simulate-bundle adapter. All I/O is injectable; errors and
 * timeouts surface as `unavailable` so callers can fail closed.
 */
export function createTenderlyBundleSimulationAdapter(
  config: TenderlyBundleConfig,
): BundleSimulationAdapter {
  const fetchFn = config.fetchFn ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = `${TENDERLY_API_URL}/account/${config.accountSlug}/project/${config.projectSlug}/simulate-bundle`;

  return {
    async simulateBundle(request) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetchFn(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Access-Key': config.accessKey,
          },
          signal: controller.signal,
          body: JSON.stringify({
            simulations: request.calls.map((call) => ({
              network_id: request.chainId.toString(),
              from: request.from,
              to: call.to,
              input: call.data,
              value: call.value,
              gas: CALL_GAS_LIMIT,
              save: false,
              save_if_fails: false,
              // The gate only reads per-call statuses; 'full' traces reach
              // >100MB on heavy bundles and would exhaust the 256MB host.
              simulation_type: 'quick',
            })),
          }),
        });
      } catch (error) {
        const reason =
          error instanceof DOMException && error.name === 'AbortError'
            ? 'Tenderly bundle simulation timed out'
            : `Tenderly bundle simulation unavailable: ${error instanceof Error ? error.message : String(error)}`;
        return { status: 'unavailable', reason };
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        return {
          status: 'unavailable',
          reason: `Tenderly bundle simulation returned HTTP ${response.status}`,
        };
      }

      let results: z.infer<typeof ResultsSchema>;
      try {
        results = ResultsSchema.parse(await response.json());
      } catch {
        return {
          status: 'unavailable',
          reason: 'Tenderly returned malformed bundle simulation data',
        };
      }

      // Tenderly stops after the first reverting call, so fewer results than
      // calls is only acceptable when the last returned result is the revert.
      const failed = results.simulation_results.find(
        (result) => !(result.transaction?.status && result.simulation.status),
      );
      if (failed) {
        return {
          status: 'failed',
          reason:
            failed.transaction?.error_message?.trim() ||
            failed.simulation.error_message?.trim() ||
            'Simulation reverted',
        };
      }
      if (results.simulation_results.length < request.calls.length) {
        return {
          status: 'unavailable',
          reason: `Tenderly returned ${results.simulation_results.length} results for ${request.calls.length} calls`,
        };
      }

      return { status: 'passed' };
    },
  };
}
