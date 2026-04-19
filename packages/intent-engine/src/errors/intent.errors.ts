export type IntentErrorCode =
  | "INTENT_ENGINE_ERROR"
  | "VALIDATION_ERROR"
  | "QUOTE_ERROR"
  | "INSUFFICIENT_BALANCE"
  | "SLIPPAGE_EXCEEDED"
  | "UNSUPPORTED_CHAIN"
  | "UNSUPPORTED_TOKEN"
  | "EXECUTION_ERROR"
  | "SIMULATION_FAILED";

export class IntentEngineError extends Error {
  public readonly code: IntentErrorCode;
  public readonly errorCause?: unknown;

  constructor(
    message: string,
    options?: { code?: IntentErrorCode; cause?: unknown }
  ) {
    super(message);
    this.name = "IntentEngineError";
    this.code = options?.code ?? "INTENT_ENGINE_ERROR";
    this.errorCause = options?.cause;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      cause:
        this.errorCause instanceof Error
          ? this.errorCause.message
          : this.errorCause,
    };
  }
}

export class ValidationError extends IntentEngineError {
  public readonly issues: unknown[];

  constructor(message: string, issues: unknown[] = []) {
    super(message, { code: "VALIDATION_ERROR" });
    this.name = "ValidationError";
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
    super(message, { code: "QUOTE_ERROR", ...options });
    this.name = "QuoteError";
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
        code: "INSUFFICIENT_BALANCE",
      }
    );
    this.name = "InsufficientBalanceError";
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
        code: "SLIPPAGE_EXCEEDED",
      }
    );
    this.name = "SlippageError";
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
        code: "UNSUPPORTED_CHAIN",
      }
    );
    this.name = "UnsupportedChainError";
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
      code: "UNSUPPORTED_TOKEN",
    });
    this.name = "UnsupportedTokenError";
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
    super(message, { code: "EXECUTION_ERROR", cause: options?.cause });
    this.name = "ExecutionError";
    this.hash = options?.hash;
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      hash: this.hash,
    };
  }
}

export class SimulationFailedError extends IntentEngineError {
  public readonly simulationError?: string;

  constructor(message: string, simulationError?: string) {
    super(message, { code: "SIMULATION_FAILED" });
    this.name = "SimulationFailedError";
    this.simulationError = simulationError;
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      simulationError: this.simulationError,
    };
  }
}
