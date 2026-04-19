import type {
  PreparedTransaction,
  SimulationResult,
} from '../types/transaction.types.js';

/**
 * Interface for transaction simulation adapters
 */
export interface SimulationAdapter {
  simulate(tx: PreparedTransaction): Promise<SimulationResult>;
}

/**
 * Tenderly simulation adapter configuration
 */
export interface TenderlyConfig {
  accountSlug: string;
  projectSlug: string;
  accessKey: string;
}

/**
 * Tenderly simulation adapter (stub for POC)
 * In production, this would call Tenderly's simulation API
 */
export class TenderlySimulationAdapter implements SimulationAdapter {
  constructor(private readonly _config: TenderlyConfig) {}

  async simulate(tx: PreparedTransaction): Promise<SimulationResult> {
    // POC: Return mock success
    // Production implementation would:
    // 1. Call POST https://api.tenderly.co/api/v1/account/{account}/project/{project}/simulate
    // 2. Parse response for gas usage, errors, state changes
    // 3. Return structured result

    // eslint-disable-next-line no-console -- intentional POC signal that this simulator is stubbed
    console.warn('[TenderlySimulationAdapter] Simulation is stubbed in POC');

    return {
      success: true,
      gasUsed: tx.meta.estimatedGas ?? '100000',
      logs: [],
      stateChanges: [],
    };
  }
}

/**
 * No-op simulation adapter for environments without simulation
 */
export class NoopSimulationAdapter implements SimulationAdapter {
  async simulate(_tx: PreparedTransaction): Promise<SimulationResult> {
    return { success: true };
  }
}
