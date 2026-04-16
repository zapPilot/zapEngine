import { describe, expect, it } from "vitest";

import {
  buildModalFormState,
  EmptyAssetsMessage,
  resolveActionLabel,
  TokenOptionButton,
  TransactionModalContent,
  useTransactionModalState,
} from "../../../../../../src/components/wallet/portfolio/modals/transactionModalDependencies";

describe("transactionModalDependencies barrel exports", () => {
  it("exports EmptyAssetsMessage component", () => {
    expect(EmptyAssetsMessage).toBeDefined();
  });

  it("exports TokenOptionButton component", () => {
    expect(TokenOptionButton).toBeDefined();
  });

  it("exports TransactionModalContent component", () => {
    expect(TransactionModalContent).toBeDefined();
  });

  it("exports useTransactionModalState hook", () => {
    expect(useTransactionModalState).toBeDefined();
    expect(typeof useTransactionModalState).toBe("function");
  });

  it("exports resolveActionLabel utility", () => {
    expect(resolveActionLabel).toBeDefined();
    expect(typeof resolveActionLabel).toBe("function");
  });

  it("exports buildModalFormState utility", () => {
    expect(buildModalFormState).toBeDefined();
    expect(typeof buildModalFormState).toBe("function");
  });
});
