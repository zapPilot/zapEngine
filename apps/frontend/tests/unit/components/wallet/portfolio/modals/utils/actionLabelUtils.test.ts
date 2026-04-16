import { describe, expect, it } from "vitest";

import { resolveActionLabel } from "@/components/wallet/portfolio/modals/utils/actionLabelUtils";
import { WALLET_LABELS } from "@/constants/wallet";

interface ActionLabelInput {
  isConnected: boolean;
  isReady: boolean;
  readyLabel: string;
  notReadyLabel: string;
  hasSelection?: boolean;
  selectionLabel?: string;
}

function createActionLabelInput(
  overrides: Partial<ActionLabelInput> = {}
): ActionLabelInput {
  return {
    isConnected: true,
    isReady: true,
    readyLabel: "Execute",
    notReadyLabel: "Not Ready",
    hasSelection: true,
    ...overrides,
  };
}

describe("resolveActionLabel", () => {
  it("returns 'Connect Wallet' when not connected", () => {
    const result = resolveActionLabel(
      createActionLabelInput({ isConnected: false })
    );

    expect(result).toBe(WALLET_LABELS.CONNECT);
  });

  it("returns selectionLabel when connected but no selection (hasSelection=false)", () => {
    const result = resolveActionLabel(
      createActionLabelInput({
        hasSelection: false,
        selectionLabel: "Select an option",
      })
    );

    expect(result).toBe("Select an option");
  });

  it("returns notReadyLabel when connected with selection but not ready", () => {
    const result = resolveActionLabel(
      createActionLabelInput({ isReady: false })
    );

    expect(result).toBe("Not Ready");
  });

  it("returns readyLabel when connected, has selection, and is ready", () => {
    const result = resolveActionLabel(createActionLabelInput());

    expect(result).toBe("Execute");
  });

  it("defaults hasSelection to true when not provided", () => {
    const result = resolveActionLabel(
      createActionLabelInput({ hasSelection: undefined })
    );

    expect(result).toBe("Execute");
  });

  it("defaults selectionLabel to notReadyLabel when not provided and hasSelection=false", () => {
    const result = resolveActionLabel(
      createActionLabelInput({ hasSelection: false })
    );

    expect(result).toBe("Not Ready");
  });
});
