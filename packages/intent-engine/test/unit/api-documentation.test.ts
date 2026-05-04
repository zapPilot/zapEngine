import { describe, it, expect } from 'vitest';
import * as intentEngine from '../../src/index.js';

describe('API Documentation Consistency', () => {
  describe('README Export Table Completeness', () => {
    it('should export TenderlySimulationAdapter', () => {
      expect(intentEngine.TenderlySimulationAdapter).toBeDefined();
    });

    it('should export NoopSimulationAdapter', () => {
      expect(intentEngine.NoopSimulationAdapter).toBeDefined();
    });

    it('should export execution functions', () => {
      expect(intentEngine.detectEIP7702Support).toBeDefined();
      expect(typeof intentEngine.detectEIP7702Support).toBe('function');

      expect(intentEngine.determineExecutionStrategy).toBeDefined();
      expect(typeof intentEngine.determineExecutionStrategy).toBe('function');

      expect(intentEngine.encodeMulticall3).toBeDefined();
      expect(typeof intentEngine.encodeMulticall3).toBe('function');

      expect(intentEngine.executeWithEIP7702).toBeDefined();
      expect(typeof intentEngine.executeWithEIP7702).toBe('function');

      expect(intentEngine.waitForEIP7702Confirmation).toBeDefined();
      expect(typeof intentEngine.waitForEIP7702Confirmation).toBe('function');
    });

    it('should export protocol constants', () => {
      expect(intentEngine.DEFAULT_VAULT_REGISTRY).toBeDefined();
      expect(intentEngine.MORPHO_VAULT_CATALOG).toBeDefined();
      expect(intentEngine.MORPHO_VAULT_ABI).toBeDefined();
      expect(intentEngine.MORPHO_GAS_ESTIMATES).toBeDefined();
    });

    it('should export all validators', () => {
      expect(intentEngine.validateSwapIntent).toBeDefined();
      expect(typeof intentEngine.validateSwapIntent).toBe('function');

      expect(intentEngine.validateSupplyIntent).toBeDefined();
      expect(typeof intentEngine.validateSupplyIntent).toBe('function');

      expect(intentEngine.validateWithdrawIntent).toBeDefined();
      expect(typeof intentEngine.validateWithdrawIntent).toBe('function');

      expect(intentEngine.validateRotateIntent).toBeDefined();
      expect(typeof intentEngine.validateRotateIntent).toBe('function');
    });

    it('should export all builders', () => {
      expect(intentEngine.buildSwapTx).toBeDefined();
      expect(typeof intentEngine.buildSwapTx).toBe('function');

      expect(intentEngine.buildSupplyTx).toBeDefined();
      expect(typeof intentEngine.buildSupplyTx).toBe('function');

      expect(intentEngine.buildWithdrawTx).toBeDefined();
      expect(typeof intentEngine.buildWithdrawTx).toBe('function');

      expect(intentEngine.buildRotateTx).toBeDefined();
      expect(typeof intentEngine.buildRotateTx).toBe('function');
    });

    it('should export error types from ./errors/index.js', () => {
      expect(intentEngine.ValidationError).toBeDefined();
      expect(intentEngine.IntentEngineError).toBeDefined();
      expect(intentEngine.QuoteError).toBeDefined();
      expect(intentEngine.InsufficientBalanceError).toBeDefined();
      expect(intentEngine.SlippageError).toBeDefined();
      expect(intentEngine.UnsupportedChainError).toBeDefined();
      expect(intentEngine.UnsupportedTokenError).toBeDefined();
      expect(intentEngine.ExecutionError).toBeDefined();
      expect(intentEngine.SimulationFailedError).toBeDefined();
    });
  });

  describe('createIntentEngine Factory Function', () => {
    it('should export IntentEngineConfig interface', () => {
      expect(intentEngine.IntentEngineConfig).toBeDefined();
    });

    it('should export IntentEngine interface', () => {
      expect(intentEngine.IntentEngine).toBeDefined();
    });

    it('should export createIntentEngine function', () => {
      expect(intentEngine.createIntentEngine).toBeDefined();
      expect(typeof intentEngine.createIntentEngine).toBe('function');
    });
  });

  describe('Execution Layer API', () => {
    it('should export ExecutionStrategy type', () => {
      expect(intentEngine.ExecutionStrategyType).toBeDefined();
    });
  });
});
