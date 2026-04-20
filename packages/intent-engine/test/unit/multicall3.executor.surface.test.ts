import { describe, expect, it } from "vitest";
import { encodeMulticall3 } from "../../src/execution/multicall3.executor.js";
import type { PreparedTransaction } from "../../src/types/transaction.types.js";

const TARGET_A = "0x1111111111111111111111111111111111111111" as const;

function makeTx(
  overrides: Partial<PreparedTransaction> = {}
): PreparedTransaction {
  return {
    to: TARGET_A,
    data: "0xdeadbeef",
    value: "0",
    chainId: 1,
    gasLimit: "100000",
    meta: { intentType: "TEST" },
    ...overrides,
  };
}

describe("encodeMulticall3 - Surface Expansion", () => {
  // 1. null / undefined / empty
  it("should handle null or undefined gracefully (runtime safety)", () => {
    // @ts-expect-error - Testing runtime safety for non-TS consumers or bypasses
    expect(() => encodeMulticall3(null)).toThrow();
    // @ts-expect-error - Testing runtime safety
    expect(() => encodeMulticall3(undefined)).toThrow();
  });

  it("should handle empty transaction data", () => {
    const tx = makeTx({ data: "0x" });
    const result = encodeMulticall3([tx]);
    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
    expect(result.data.startsWith("0x")).toBe(true);
  });

  // 2. boundary values
  it("should handle extremely large value strings", () => {
    const tx = makeTx({
      value:
        "115792089237316195423570985008687907853269984665640564039457584007913129639935",
    }); // 2^256 - 1
    const result = encodeMulticall3([tx]);
    expect(result.value).toBe(
      "115792089237316195423570985008687907853269984665640564039457584007913129639935"
    );
  });

  it("should handle large gasLimit strings", () => {
    const tx = makeTx({ gasLimit: "30000000" }); // Typical block gas limit
    const result = encodeMulticall3([tx]);
    // 30,000,000 + 50,000 overhead
    expect(result.gasLimit).toBe("30050000");
  });

  it("should handle multiple transactions (large batch)", () => {
    const txs = Array.from({ length: 100 }, () => makeTx());
    const result = encodeMulticall3(txs);
    expect(result.to).toBeDefined();
    expect(result.data).toBeDefined();
  });

  // 3. different types / malformed data (ensure no crashes)
  it("should handle missing optional fields in meta", () => {
    const tx = makeTx();
    tx.meta = { intentType: "TEST" };
    const result = encodeMulticall3([tx]);
    expect(result.meta.intentType).toBe("MULTICALL3_BATCH");
  });

  it("should not crash with unexpected data types (runtime safety)", () => {
    const txs = [
      {
        to: TARGET_A,
        data: "0x1234",
        value: "0",
        chainId: 1,
        // missing gasLimit and meta
      } as unknown as PreparedTransaction,
    ];
    // This should probably not crash, even if it might fail downstream or throw if it accesses undefined
    // Currently it accesses tx.gasLimit (which is undefined, so it defaults to 100k)
    // and tx.meta (which is undefined, so it crashes when accessing tx.meta.intentType if it were used,
    // but encodeMulticall3 creates a NEW meta object)

    expect(() => encodeMulticall3(txs)).not.toThrow();
  });

  it("should handle very large arrays of txs", () => {
    const txs = Array.from({ length: 500 }, () => makeTx());
    const result = encodeMulticall3(txs);
    expect(result.data.length).toBeGreaterThan(100);
  });
});
