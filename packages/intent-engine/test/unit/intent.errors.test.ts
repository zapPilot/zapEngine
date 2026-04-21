import { describe, expect, it } from "vitest";
import {
  IntentEngineError,
  ValidationError,
  InsufficientBalanceError,
  SlippageError,
  UnsupportedChainError,
  UnsupportedTokenError,
  ExecutionError,
  SimulationFailedError,
} from "../../src/errors/intent.errors.js";

describe("intent.errors", () => {
  describe("IntentEngineError", () => {
    it("should serialize to JSON correctly without cause", () => {
      const error = new IntentEngineError("test error");
      const json = error.toJSON();
      expect(json).toEqual({
        name: "IntentEngineError",
        code: "INTENT_ENGINE_ERROR",
        message: "test error",
        cause: undefined,
      });
    });

    it("should serialize to JSON correctly with Error cause", () => {
      const cause = new Error("base error");
      const error = new IntentEngineError("test error", { cause });
      const json = error.toJSON();
      expect(json.cause).toBe("base error");
    });

    it("should serialize to JSON correctly with non-Error cause", () => {
      const cause = { detail: "something" };
      const error = new IntentEngineError("test error", { cause });
      const json = error.toJSON();
      expect(json.cause).toEqual(cause);
    });
  });

  describe("ValidationError", () => {
    it("should include issues in JSON", () => {
      const issues = [{ path: "amount", message: "too small" }];
      const error = new ValidationError("invalid input", issues);
      const json = error.toJSON();
      expect(json.issues).toEqual(issues);
      expect(json.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("InsufficientBalanceError", () => {
    it("should include balance details in JSON", () => {
      const error = new InsufficientBalanceError("USDC", "100", "50");
      const json = error.toJSON();
      expect(json.token).toBe("USDC");
      expect(json.required).toBe("100");
      expect(json.available).toBe("50");
      expect(json.code).toBe("INSUFFICIENT_BALANCE");
    });
  });

  describe("SlippageError", () => {
    it("should include slippage details in JSON", () => {
      const error = new SlippageError("100", "90");
      const json = error.toJSON();
      expect(json.expected).toBe("100");
      expect(json.received).toBe("90");
      expect(json.code).toBe("SLIPPAGE_EXCEEDED");
    });
  });

  describe("UnsupportedChainError", () => {
    it("should include chainId in JSON", () => {
      const error = new UnsupportedChainError(42);
      const json = error.toJSON();
      expect(json.chainId).toBe(42);
      expect(json.code).toBe("UNSUPPORTED_CHAIN");
    });
  });

  describe("UnsupportedTokenError", () => {
    it("should include token and chainId in JSON", () => {
      const error = new UnsupportedTokenError("WBT", 1);
      const json = error.toJSON();
      expect(json.token).toBe("WBT");
      expect(json.chainId).toBe(1);
      expect(json.code).toBe("UNSUPPORTED_TOKEN");
    });
  });

  describe("ExecutionError", () => {
    it("should include hash in JSON", () => {
      const error = new ExecutionError("failed", { hash: "0x123" });
      const json = error.toJSON();
      expect(json.hash).toBe("0x123");
      expect(json.code).toBe("EXECUTION_ERROR");
    });
  });

  describe("SimulationFailedError", () => {
    it("should include simulationError in JSON", () => {
      const error = new SimulationFailedError("sim failed", "out of gas");
      const json = error.toJSON();
      expect(json.simulationError).toBe("out of gas");
      expect(json.code).toBe("SIMULATION_FAILED");
    });
  });
});
