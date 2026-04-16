/**
 * clipboard.ts Tests
 *
 * Tests for clipboard utility function
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { copyTextToClipboard } from "@/utils/clipboard";

describe("copyTextToClipboard", () => {
  const originalNavigator = global.navigator;
  const originalDocument = global.document;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore originals
    Object.defineProperty(global, "navigator", { value: originalNavigator });
    Object.defineProperty(global, "document", { value: originalDocument });
  });

  describe("when navigator.clipboard is available", () => {
    it("copies text using clipboard API and returns true", async () => {
      const writeTextMock = vi.fn().mockResolvedValue(null);
      Object.defineProperty(global, "navigator", {
        value: { clipboard: { writeText: writeTextMock } },
        writable: true,
      });

      const result = await copyTextToClipboard("test text");

      expect(writeTextMock).toHaveBeenCalledWith("test text");
      expect(result).toBe(true);
    });
  });

  describe("when navigator is undefined", () => {
    it("returns false", async () => {
      Object.defineProperty(global, "navigator", {
        value: undefined,
        writable: true,
      });

      const result = await copyTextToClipboard("test text");

      expect(result).toBe(false);
    });
  });

  describe("when clipboard API fails", () => {
    beforeEach(() => {
      Object.defineProperty(global, "navigator", {
        value: {
          clipboard: {
            writeText: vi.fn().mockRejectedValue(new Error("Clipboard error")),
          },
        },
        writable: true,
      });
    });

    it("falls back to execCommand when available", async () => {
      const mockTextArea = {
        value: "",
        setAttribute: vi.fn(),
        style: {} as CSSStyleDeclaration,
        select: vi.fn(),
      };
      const createElementMock = vi.fn().mockReturnValue(mockTextArea);
      const appendChildMock = vi.fn();
      const removeChildMock = vi.fn();
      const execCommandMock = vi.fn().mockReturnValue(true);

      Object.defineProperty(global, "document", {
        value: {
          createElement: createElementMock,
          body: {
            appendChild: appendChildMock,
            removeChild: removeChildMock,
          },
          execCommand: execCommandMock,
        },
        writable: true,
      });

      const result = await copyTextToClipboard("fallback text");

      expect(createElementMock).toHaveBeenCalledWith("textarea");
      expect(execCommandMock).toHaveBeenCalledWith("copy");
      expect(result).toBe(true);
    });

    it("returns false when document is undefined", async () => {
      Object.defineProperty(global, "document", {
        value: undefined,
        writable: true,
      });

      const result = await copyTextToClipboard("test text");

      expect(result).toBe(false);
    });

    it("returns false when execCommand throws", async () => {
      const mockTextArea = {
        value: "",
        setAttribute: vi.fn(),
        style: {} as CSSStyleDeclaration,
        select: vi.fn(),
      };
      const createElementMock = vi.fn().mockReturnValue(mockTextArea);
      const appendChildMock = vi.fn();
      const removeChildMock = vi.fn();

      // Mock execCommand to throw
      const execCommandMock = vi.fn().mockImplementation(() => {
        throw new Error("Command failed");
      });

      Object.defineProperty(global, "document", {
        value: {
          createElement: createElementMock,
          body: {
            appendChild: appendChildMock,
            removeChild: removeChildMock,
          },
          execCommand: execCommandMock,
        },
        writable: true,
      });

      const result = await copyTextToClipboard("fallback text");

      expect(result).toBe(false);
      expect(execCommandMock).toHaveBeenCalledWith("copy");
    });
  });
});
