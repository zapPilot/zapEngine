// =============================================================================
// @zapengine/intent-engine
// =============================================================================
// Intent-based DeFi execution engine using LI.FI Composer
// Supports Ethereum and Base chains with Morpho protocol
// =============================================================================

// Types
export * from './types/index.js';

// Errors
export * from './errors/index.js';

// Validators
export {
  validateIntent,
  validateSwapIntent,
  validateSupplyIntent,
  validateWithdrawIntent,
  validateRotateIntent,
} from './validators/index.js';

// Builders
export {
  buildSwapTx,
  buildSupplyTx,
  buildWithdrawTx,
  buildRotateTx,
} from './builders/index.js';

// Adapters
export {
  LiFiAdapter,
  type LiFiAdapterConfig,
  type SimulationAdapter,
  TenderlySimulationAdapter,
  type TenderlyConfig,
  NoopSimulationAdapter,
} from './adapters/index.js';

// Execution
export {
  detectEIP7702Support,
  determineExecutionStrategy,
  type ExecutionStrategy,
  encodeMulticall3,
  executeWithEIP7702,
  waitForEIP7702Confirmation,
} from './execution/index.js';

// Protocol constants
export {
  DEFAULT_VAULT_REGISTRY,
  MORPHO_VAULTS,
  MORPHO_VAULT_CATALOG,
  MORPHO_VAULT_ABI,
  MORPHO_GAS_ESTIMATES,
  ProtocolCapabilitySchema,
  ProtocolIdSchema,
  VaultMetaSchema,
  encodeDeposit,
  encodeMint,
  encodeWithdraw,
  encodeRedeem,
  findVaultByAddress,
  lookupVault,
  morphoVaultCatalogSource,
  type AprSource,
  type ProtocolCapability,
  type ProtocolId,
  type TvlSource,
  type VaultCatalogSource,
  type VaultMeta,
  type VaultRegistry,
} from './protocols/index.js';

// =============================================================================
// Factory Function
// =============================================================================

import type { PublicClient, WalletClient } from 'viem';

import {
  LiFiAdapter,
  type LiFiAdapterConfig,
} from './adapters/lifi.adapter.js';
import {
  NoopSimulationAdapter,
  type SimulationAdapter,
} from './adapters/simulation.adapter.js';
import { buildSwapTx } from './builders/swap.builder.js';
import { buildSupplyTx } from './builders/supply.builder.js';
import { buildWithdrawTx } from './builders/withdraw.builder.js';
import { buildRotateTx } from './builders/rotate.builder.js';
import {
  determineExecutionStrategy,
  type ExecutionStrategy,
} from './execution/capability.detector.js';
import { encodeMulticall3 } from './execution/multicall3.executor.js';
import { executeWithEIP7702 } from './execution/eip7702.executor.js';
import type {
  SwapIntentInput,
  SupplyIntentInput,
  WithdrawIntentInput,
  RotateIntentInput,
} from './types/intent.types.js';
import type {
  PreparedTransaction,
  TransactionQuote,
  RotateTransactionPlan,
  SimulationResult,
  ExecutionResult,
} from './types/transaction.types.js';

/**
 * Configuration for creating an IntentEngine instance
 */
export interface IntentEngineConfig {
  /** LI.FI adapter configuration */
  lifi: LiFiAdapterConfig;
  /** Optional simulation adapter (defaults to NoopSimulationAdapter) */
  simulation?: SimulationAdapter;
}

/**
 * IntentEngine provides a unified API for building and executing DeFi transactions
 */
export interface IntentEngine {
  /** LI.FI adapter for direct access */
  readonly lifi: LiFiAdapter;
  /** Simulation adapter for direct access */
  readonly simulation: SimulationAdapter;

  /** Build a swap transaction */
  buildSwap(intent: SwapIntentInput): Promise<TransactionQuote>;

  /** Build a supply (deposit) transaction (requires a PublicClient to read vault.asset()) */
  buildSupply(
    intent: SupplyIntentInput,
    publicClient: PublicClient,
  ): Promise<TransactionQuote>;

  /** Build a withdraw transaction */
  buildWithdraw(intent: WithdrawIntentInput): PreparedTransaction;

  /** Build a rotate transaction plan (requires a PublicClient for on-chain previews) */
  buildRotate(
    intent: RotateIntentInput,
    publicClient: PublicClient,
  ): Promise<RotateTransactionPlan>;

  /** Simulate a transaction before execution */
  simulateTx(tx: PreparedTransaction): Promise<SimulationResult>;

  /** Determine best execution strategy for a wallet on a given chain */
  getExecutionStrategy(
    wallet?: WalletClient,
    chainId?: number,
  ): Promise<ExecutionStrategy>;

  /** Batch transactions for atomic execution */
  batchTransactions(txs: PreparedTransaction[]): PreparedTransaction;

  /** Execute batched transactions with EIP-7702 */
  executeWithEIP7702(
    txs: PreparedTransaction[],
    wallet: WalletClient,
  ): Promise<ExecutionResult>;
}

/**
 * Create an IntentEngine instance
 *
 * @example
 * ```typescript
 * const engine = createIntentEngine({
 *   lifi: { integrator: 'my-app' },
 * });
 *
 * const quote = await engine.buildSwap({
 *   type: 'SWAP',
 *   fromAddress: '0x...',
 *   chainId: 1,
 *   fromToken: '0x...',
 *   toToken: '0x...',
 *   fromAmount: '1000000000000000000',
 * });
 * ```
 */
export function createIntentEngine(config: IntentEngineConfig): IntentEngine {
  const lifiAdapter = new LiFiAdapter(config.lifi);
  const simulationAdapter = config.simulation ?? new NoopSimulationAdapter();

  return {
    lifi: lifiAdapter,
    simulation: simulationAdapter,

    async buildSwap(intent: SwapIntentInput) {
      return buildSwapTx(intent, lifiAdapter);
    },

    async buildSupply(intent: SupplyIntentInput, publicClient: PublicClient) {
      return buildSupplyTx(intent, lifiAdapter, publicClient);
    },

    buildWithdraw(intent: WithdrawIntentInput) {
      return buildWithdrawTx(intent);
    },

    async buildRotate(intent: RotateIntentInput, publicClient: PublicClient) {
      return buildRotateTx(intent, lifiAdapter, publicClient);
    },

    async simulateTx(tx: PreparedTransaction) {
      return simulationAdapter.simulate(tx);
    },

    async getExecutionStrategy(wallet?: WalletClient, chainId?: number) {
      return determineExecutionStrategy(wallet, chainId);
    },

    batchTransactions(txs: PreparedTransaction[]) {
      return encodeMulticall3(txs);
    },

    async executeWithEIP7702(txs: PreparedTransaction[], wallet: WalletClient) {
      return executeWithEIP7702(txs, wallet);
    },
  };
}
