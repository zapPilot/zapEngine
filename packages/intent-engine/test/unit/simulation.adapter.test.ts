import { describe, it, expect, vi } from "vitest";
import {
  TenderlySimulationAdapter,
  NoopSimulationAdapter,
} from "../../src/adapters/simulation.adapter.js";
import type { PreparedTransaction } from "../../src/types/transaction.types.js";

describe("Simulation Adapters", () => {
  const mockTx: PreparedTransaction = {
    to: "0x123",
    data: "0xdata",
    value: "0",
    chainId: 1,
    meta: {
      intentType: "SWAP",
      estimatedGas: "50000",
    },
  };

  describe("TenderlySimulationAdapter", () => {
    it("should return mock success and log a warning", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const adapter = new TenderlySimulationAdapter({
        accountSlug: "test-account",
        projectSlug: "test-project",
        accessKey: "test-key",
      });

      const result = await adapter.simulate(mockTx);

      expect(result.success).toBe(true);
      expect(result.gasUsed).toBe("50000");
      expect(result.logs).toEqual([]);
      expect(result.stateChanges).toEqual([]);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "[TenderlySimulationAdapter] Simulation is stubbed in POC"
      );

      consoleWarnSpy.mockRestore();
    });

    it("should fallback to 100000 gas if estimatedGas is not provided", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const adapter = new TenderlySimulationAdapter({
        accountSlug: "test-account",
        projectSlug: "test-project",
        accessKey: "test-key",
      });

      const txWithoutGas = { ...mockTx, meta: { intentType: "SWAP" } };
      const result = await adapter.simulate(txWithoutGas);

      expect(result.gasUsed).toBe("100000");

      consoleWarnSpy.mockRestore();
    });
  });

  describe("NoopSimulationAdapter", () => {
    it("should return success true", async () => {
      const adapter = new NoopSimulationAdapter();
      const result = await adapter.simulate(mockTx);

      expect(result).toEqual({ success: true });
    });
  });
});
