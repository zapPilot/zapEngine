import {
  GMX_DEPOSIT_TOO_SMALL_ERROR_CODE,
  HLP_DEPOSIT_TOO_SMALL_ERROR_CODE,
} from '@zapengine/types/api';

export type IntentErrorCode =
  | 'INTENT_ENGINE_ERROR'
  | 'VALIDATION_ERROR'
  | 'QUOTE_ERROR'
  | 'INSUFFICIENT_BALANCE'
  | 'SLIPPAGE_EXCEEDED'
  | 'UNSUPPORTED_CHAIN'
  | 'UNSUPPORTED_TOKEN'
  | 'EXECUTION_ERROR'
  | 'SIMULATION_FAILED'
  | typeof GMX_DEPOSIT_TOO_SMALL_ERROR_CODE
  | typeof HLP_DEPOSIT_TOO_SMALL_ERROR_CODE;

export class IntentEngineError extends Error {
  public readonly code: IntentErrorCode;

  constructor(
    message: string,
    options?: { code?: IntentErrorCode; cause?: unknown },
  ) {
    super(
      message,
      options?.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = 'IntentEngineError';
    this.code = options?.code ?? 'INTENT_ENGINE_ERROR';
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      cause: this.cause instanceof Error ? this.cause.message : this.cause,
    };
  }
}

export class ValidationError extends IntentEngineError {
  public readonly issues: unknown[];

  constructor(message: string, issues: unknown[] = []) {
    super(message, { code: 'VALIDATION_ERROR' });
    this.name = 'ValidationError';
    this.issues = issues;
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      issues: this.issues,
    };
  }
}

export class QuoteError extends IntentEngineError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, { code: 'QUOTE_ERROR', ...options });
    this.name = 'QuoteError';
  }
}

export class InsufficientBalanceError extends IntentEngineError {
  public readonly token: string;
  public readonly required: string;
  public readonly available: string;

  constructor(token: string, required: string, available: string) {
    super(
      `Insufficient ${token} balance: required ${required}, available ${available}`,
      {
        code: 'INSUFFICIENT_BALANCE',
      },
    );
    this.name = 'InsufficientBalanceError';
    this.token = token;
    this.required = required;
    this.available = available;
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      token: this.token,
      required: this.required,
      available: this.available,
    };
  }
}

export class SlippageError extends IntentEngineError {
  public readonly expected: string;
  public readonly received: string;

  constructor(expected: string, received: string) {
    super(
      `Slippage exceeded: expected ${expected}, would receive ${received}`,
      {
        code: 'SLIPPAGE_EXCEEDED',
      },
    );
    this.name = 'SlippageError';
    this.expected = expected;
    this.received = received;
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      expected: this.expected,
      received: this.received,
    };
  }
}

export class UnsupportedChainError extends IntentEngineError {
  public readonly chainId: number;

  constructor(chainId: number) {
    super(
      `Chain ${chainId} not supported. POC supports Ethereum (1) and Base (8453)`,
      {
        code: 'UNSUPPORTED_CHAIN',
      },
    );
    this.name = 'UnsupportedChainError';
    this.chainId = chainId;
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      chainId: this.chainId,
    };
  }
}

export class UnsupportedTokenError extends IntentEngineError {
  public readonly token: string;
  public readonly chainId: number;

  constructor(token: string, chainId: number) {
    super(`Token ${token} not supported on chain ${chainId}`, {
      code: 'UNSUPPORTED_TOKEN',
    });
    this.name = 'UnsupportedTokenError';
    this.token = token;
    this.chainId = chainId;
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      token: this.token,
      chainId: this.chainId,
    };
  }
}

export class ExecutionError extends IntentEngineError {
  public readonly hash?: string;

  constructor(message: string, options?: { cause?: unknown; hash?: string }) {
    super(message, { code: 'EXECUTION_ERROR', cause: options?.cause });
    this.name = 'ExecutionError';
    this.hash = options?.hash;
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      hash: this.hash,
    };
  }
}

/**
 * A GMX deposit leg too small to execute safely. GMX itself takes any amount;
 * what breaks is dust on our side — a funding swap whose output is too few
 * units to keep a slippage buffer, or an amount that cannot cover the keeper
 * fees or split across the basket. Typed so the HTTP layer can answer with a
 * client error the app explains, instead of an opaque 500.
 */
export class GmxDepositTooSmallError extends IntentEngineError {
  constructor(message: string) {
    super(message, { code: GMX_DEPOSIT_TOO_SMALL_ERROR_CODE });
    this.name = 'GmxDepositTooSmallError';
  }
}

/**
 * An HLP leg whose quoted HyperCore output is below the vault minimum. The
 * floor is checked on what the ingress promises to deliver, not on the amount
 * sent, so a LI.FI bridge fee can push an HLP share at the minimum under it.
 * Typed for the same reason as `GmxDepositTooSmallError`.
 */
export class HlpDepositTooSmallError extends IntentEngineError {
  constructor(message: string) {
    super(message, { code: HLP_DEPOSIT_TOO_SMALL_ERROR_CODE });
    this.name = 'HlpDepositTooSmallError';
  }
}

export class SimulationFailedError extends IntentEngineError {
  public readonly simulationError?: string;

  constructor(message: string, simulationError?: string) {
    super(message, { code: 'SIMULATION_FAILED' });
    this.name = 'SimulationFailedError';
    this.simulationError = simulationError;
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      simulationError: this.simulationError,
    };
  }
}
