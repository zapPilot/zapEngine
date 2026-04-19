import { describe, expect, it } from "vitest";
import { decodeFunctionData, getAddress, type Address } from "viem";

import {
  encodeDeposit,
  encodeMint,
  encodeRedeem,
  encodeWithdraw,
} from "../../src/protocols/morpho/morpho.encoder.js";
import { MORPHO_VAULT_ABI } from "../../src/protocols/morpho/morpho.constants.js";

const USER: Address = "0x1234567890123456789012345678901234567890";
const OTHER: Address = "0xabcdef0123456789abcdef0123456789abcdef01";

// ERC-4626 standard 4-byte selectors
const SELECTORS = {
  deposit: "0x6e553f65",
  mint: "0x94bf804d",
  withdraw: "0xb460af94",
  redeem: "0xba087652",
} as const;

describe("Morpho calldata encoders", () => {
  describe("encodeDeposit", () => {
    it("produces the ERC-4626 deposit(uint256,address) selector", () => {
      const data = encodeDeposit(1_000_000n, USER);
      expect(data.slice(0, 10)).toBe(SELECTORS.deposit);
    });

    it("round-trips args via decodeFunctionData", () => {
      const data = encodeDeposit(1_000_000n, USER);
      const decoded = decodeFunctionData({ abi: MORPHO_VAULT_ABI, data });
      expect(decoded.functionName).toBe("deposit");
      expect(decoded.args).toEqual([1_000_000n, USER]);
    });
  });

  describe("encodeMint", () => {
    it("produces the ERC-4626 mint(uint256,address) selector", () => {
      const data = encodeMint(2n ** 64n, USER);
      expect(data.slice(0, 10)).toBe(SELECTORS.mint);
    });

    it("round-trips args via decodeFunctionData", () => {
      const data = encodeMint(42n, OTHER);
      const decoded = decodeFunctionData({ abi: MORPHO_VAULT_ABI, data });
      expect(decoded.functionName).toBe("mint");
      expect(decoded.args).toEqual([42n, getAddress(OTHER)]);
    });
  });

  describe("encodeWithdraw", () => {
    it("produces the ERC-4626 withdraw(uint256,address,address) selector", () => {
      const data = encodeWithdraw(500n, USER, OTHER);
      expect(data.slice(0, 10)).toBe(SELECTORS.withdraw);
    });

    it("round-trips three args including distinct receiver and owner", () => {
      const data = encodeWithdraw(500n, USER, OTHER);
      const decoded = decodeFunctionData({ abi: MORPHO_VAULT_ABI, data });
      expect(decoded.functionName).toBe("withdraw");
      expect(decoded.args).toEqual([500n, getAddress(USER), getAddress(OTHER)]);
    });
  });

  describe("encodeRedeem", () => {
    it("produces the ERC-4626 redeem(uint256,address,address) selector", () => {
      const data = encodeRedeem(999n, USER, USER);
      expect(data.slice(0, 10)).toBe(SELECTORS.redeem);
    });

    it("round-trips when receiver equals owner", () => {
      const data = encodeRedeem(999n, USER, USER);
      const decoded = decodeFunctionData({ abi: MORPHO_VAULT_ABI, data });
      expect(decoded.functionName).toBe("redeem");
      expect(decoded.args).toEqual([999n, USER, USER]);
    });
  });
});
