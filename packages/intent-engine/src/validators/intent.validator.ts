import {
  IntentSchema,
  SwapIntentSchema,
  SupplyIntentSchema,
  WithdrawIntentSchema,
  RotateIntentSchema,
  SUPPORTED_CHAIN_IDS,
  type Intent,
  type SwapIntent,
  type SupplyIntent,
  type WithdrawIntent,
  type RotateIntent,
} from '../types/intent.types.js';
import { TOKENS } from '../types/chain.types.js';
import { MORPHO_VAULTS } from '../protocols/morpho/morpho.constants.js';
import {
  ValidationError,
  UnsupportedChainError,
  UnsupportedTokenError,
} from '../errors/intent.errors.js';

const SUPPORTED_CHAINS_SET = new Set(SUPPORTED_CHAIN_IDS);

function assertSupportedChain(chainId: number): void {
  if (
    !SUPPORTED_CHAINS_SET.has(chainId as (typeof SUPPORTED_CHAIN_IDS)[number])
  ) {
    throw new UnsupportedChainError(chainId);
  }
}

/**
 * Catch addresses that are known tokens on a *different* chain than the one
 * the intent targets. Unknown addresses pass — we don't maintain an exhaustive
 * allowlist, only an "obvious cross-chain mistake" detector.
 */
function assertKnownOnThisChainOrUnknown(
  address: string,
  chainId: number,
  registry: Record<number, Record<string, string>>,
  kind: 'token' | 'vault',
): void {
  const lc = address.toLowerCase();
  const onThisChain = Object.values(registry[chainId] ?? {}).some(
    (addr) => addr.toLowerCase() === lc,
  );
  if (onThisChain) {
    return;
  }

  for (const [otherChainIdStr, entries] of Object.entries(registry)) {
    const otherChainId = Number(otherChainIdStr);
    if (otherChainId === chainId) {
      continue;
    }
    const onOtherChain = Object.values(entries).some(
      (addr) => addr.toLowerCase() === lc,
    );
    if (onOtherChain) {
      if (kind === 'token') {
        throw new UnsupportedTokenError(address, chainId);
      }
      throw new ValidationError(
        `Vault ${address} is known on chain ${otherChainId}, not chain ${chainId}`,
      );
    }
  }
}

function assertTokenForChain(token: string, chainId: number): void {
  assertKnownOnThisChainOrUnknown(
    token,
    chainId,
    TOKENS as unknown as Record<number, Record<string, string>>,
    'token',
  );
}

function assertVaultForChain(vault: string, chainId: number): void {
  assertKnownOnThisChainOrUnknown(
    vault,
    chainId,
    MORPHO_VAULTS as unknown as Record<number, Record<string, string>>,
    'vault',
  );
}

/**
 * Validate any intent type
 */
export function validateIntent(intent: unknown): Intent {
  const result = IntentSchema.safeParse(intent);
  if (!result.success) {
    throw new ValidationError('Invalid intent', result.error.issues);
  }
  assertSupportedChain(result.data.chainId);
  return result.data;
}

/**
 * Validate swap intent
 */
export function validateSwapIntent(intent: unknown): SwapIntent {
  const result = SwapIntentSchema.safeParse(intent);
  if (!result.success) {
    throw new ValidationError('Invalid swap intent', result.error.issues);
  }
  assertSupportedChain(result.data.chainId);
  assertTokenForChain(result.data.fromToken, result.data.chainId);
  assertTokenForChain(result.data.toToken, result.data.chainId);
  return result.data;
}

/**
 * Validate supply intent
 */
export function validateSupplyIntent(intent: unknown): SupplyIntent {
  const result = SupplyIntentSchema.safeParse(intent);
  if (!result.success) {
    throw new ValidationError('Invalid supply intent', result.error.issues);
  }
  assertSupportedChain(result.data.chainId);
  assertTokenForChain(result.data.fromToken, result.data.chainId);
  assertVaultForChain(result.data.vaultAddress, result.data.chainId);
  return result.data;
}

/**
 * Validate withdraw intent
 */
export function validateWithdrawIntent(intent: unknown): WithdrawIntent {
  const result = WithdrawIntentSchema.safeParse(intent);
  if (!result.success) {
    throw new ValidationError('Invalid withdraw intent', result.error.issues);
  }
  assertSupportedChain(result.data.chainId);
  assertVaultForChain(result.data.vaultAddress, result.data.chainId);
  return result.data;
}

/**
 * Validate rotate intent
 */
export function validateRotateIntent(intent: unknown): RotateIntent {
  const result = RotateIntentSchema.safeParse(intent);
  if (!result.success) {
    throw new ValidationError('Invalid rotate intent', result.error.issues);
  }
  assertSupportedChain(result.data.chainId);
  assertVaultForChain(result.data.fromVault, result.data.chainId);
  assertVaultForChain(result.data.toVault, result.data.chainId);
  if (result.data.intermediateToken) {
    assertTokenForChain(result.data.intermediateToken, result.data.chainId);
  }
  return result.data;
}
