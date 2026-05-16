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
  buildBridgeTx,
  buildWithdrawTx,
  buildRotateTx,
  buildGmxV2SupplyTx,
  type BuildGmxV2SupplyTxInput,
  type GmxV2SupplyPlan,
} from './builders/index.js';

// Adapters
export {
  LiFiAdapter,
  type LiFiAdapterConfig,
  type LiFiTokenInfo,
  type SimulationAdapter,
  TenderlySimulationAdapter,
  type TenderlyConfig,
  NoopSimulationAdapter,
} from './adapters/index.js';

// Execution
export {
  detectEIP7702Support,
  determineExecutionStrategy,
  executeWithEIP7702,
  waitForEIP7702Confirmation,
} from './execution/index.js';

export {
  SUPPORTED_CHAINS,
  USDC_ADDRESS,
  NATIVE_TOKEN as DEPOSIT_NATIVE_TOKEN,
  LIFI_DIAMOND_ADDRESS,
} from './registry/chains.js';
export {
  VAULT_REGISTRY,
  getVaultForBucket,
  type Bucket,
  type VaultEntry,
} from './registry/vaults.js';
export { composeDeposit } from './strategies/composeDeposit.js';

// Protocol constants
export {
  DEFAULT_VAULT_REGISTRY,
  MORPHO_VAULTS,
  MORPHO_VAULT_CATALOG,
  GMX_V2_VAULT_CATALOG,
  MORPHO_VAULT_ABI,
  MORPHO_GAS_ESTIMATES,
  GMX_V2_ADDRESSES,
  GMX_V2_ARBITRUM_CHAIN_ID,
  GMX_V2_EXCHANGE_ROUTER_ABI,
  GMX_V2_EXECUTION_FEE_WEI,
  GMX_V2_GAS_ESTIMATES,
  GMX_V2_MARKETS,
  GMX_V2_TOKENS,
  ProtocolCapabilitySchema,
  ProtocolIdSchema,
  VaultMetaSchema,
  encodeDeposit,
  encodeMint,
  encodeWithdraw,
  encodeRedeem,
  encodeGmxV2CreateDeposit,
  encodeGmxV2CreateDepositMulticall,
  encodeGmxV2SendTokens,
  encodeGmxV2SendWnt,
  findVaultByAddress,
  getGmxV2Market,
  gmxV2VaultCatalogSource,
  lookupVault,
  morphoVaultCatalogSource,
  type AprSource,
  type GmxV2FundedSide,
  type GmxV2Market,
  type GmxV2MarketKey,
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
  type LiFiTokenInfo,
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
  buildGmxV2SupplyTx,
  type BuildGmxV2SupplyTxInput,
  type GmxV2SupplyPlan as BuiltGmxV2SupplyPlan,
} from './builders/gmx-v2-supply.builder.js';
import {
  determineExecutionStrategy,
  type ExecutionStrategy,
} from './execution/capability.detector.js';
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

  /** Build a GMX v2 GM market supply plan for the dev-only Arbitrum path */
  buildGmxV2Supply(
    intent: BuildGmxV2SupplyTxInput,
  ): Promise<BuiltGmxV2SupplyPlan>;

  /** Simulate a transaction before execution */
  simulateTx(tx: PreparedTransaction): Promise<SimulationResult>;

  /** Determine best execution strategy for a wallet on a given chain */
  getExecutionStrategy(
    wallet?: WalletClient,
    chainId?: number,
  ): Promise<ExecutionStrategy>;

  /** Fetch token metadata + spot USD price (for valuing balances) */
  getTokenPrice(chainId: number, tokenAddress: string): Promise<LiFiTokenInfo>;

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

    async buildGmxV2Supply(intent: BuildGmxV2SupplyTxInput) {
      return buildGmxV2SupplyTx(intent, lifiAdapter);
    },

    async simulateTx(tx: PreparedTransaction) {
      return simulationAdapter.simulate(tx);
    },

    async getExecutionStrategy(wallet?: WalletClient, chainId?: number) {
      return determineExecutionStrategy(wallet, chainId);
    },

    async getTokenPrice(chainId: number, tokenAddress: string) {
      return lifiAdapter.getTokenPrice(chainId, tokenAddress);
    },

    async executeWithEIP7702(txs: PreparedTransaction[], wallet: WalletClient) {
      return executeWithEIP7702(txs, wallet);
    },
  };
}

// =============================================================================
// Runtime markers for TypeScript interfaces (erased at compile time)
// =============================================================================

/**
 * Runtime marker for IntentEngineConfig interface type
 * Use `typeof IntentEngineConfig` for the TypeScript type
 */
export const IntentEngineConfig = 'IntentEngineConfig';

/**
 * Runtime marker for IntentEngine interface type
 * Use `typeof IntentEngine` for the TypeScript type
 */
export const IntentEngine = 'IntentEngine';

/**
 * Runtime marker for ExecutionStrategy type
 * Use `typeof ExecutionStrategy` for the TypeScript type
 */
export const ExecutionStrategyType = 'ExecutionStrategy';
