import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  httpDelete,
  httpGet,
  httpPatch,
  httpPost,
  httpPut,
} from "@/lib/http/methods";

const { mockHttpRequest } = vi.hoisted(() => ({
  mockHttpRequest: vi.fn(),
}));

vi.mock("@/lib/http/request", () => ({
  httpRequest: mockHttpRequest,
}));

describe("http methods", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHttpRequest.mockResolvedValue({ ok: true });
  });

  describe("buildUrl", () => {
    it("uses bare endpoint when no baseURL is provided", async () => {
      // Exercises the false branch of `baseURL ? ...`
      await httpGet("/path");
      expect(mockHttpRequest).toHaveBeenCalledWith(
        "/path",
        expect.objectContaining({ method: "GET" }),
        undefined
      );
    });

    it("prepends baseURL when provided", async () => {
      // Exercises the true branch of `baseURL ? ${baseURL}${endpoint}`
      await httpGet("/path", { baseURL: "https://api.example.com" });
      expect(mockHttpRequest).toHaveBeenCalledWith(
        "https://api.example.com/path",
        expect.objectContaining({ method: "GET" }),
        undefined
      );
    });
  });

  describe("requestWithMethod body handling", () => {
    it("attaches body to config when body is not undefined", async () => {
      // Exercises the `if (body !== undefined)` true branch
      await httpPost("/data", { value: 42 });
      expect(mockHttpRequest).toHaveBeenCalledWith(
        "/data",
        expect.objectContaining({ method: "POST", body: { value: 42 } }),
        undefined
      );
    });

    it("omits body from config when body is undefined", async () => {
      // Exercises the `if (body !== undefined)` false branch
      await httpPost("/data");
      const requestConfig = mockHttpRequest.mock.calls[0]?.[1];
      expect((requestConfig as { body?: unknown })?.body).toBeUndefined();
    });
  });

  describe("exported methods", () => {
    it("httpDelete sends DELETE request", async () => {
      await httpDelete("/item");
      expect(mockHttpRequest).toHaveBeenCalledWith(
        "/item",
        expect.objectContaining({ method: "DELETE" }),
        undefined
      );
    });

    it("httpPut sends PUT request with body", async () => {
      await httpPut("/item", { update: true });
      expect(mockHttpRequest).toHaveBeenCalledWith(
        "/item",
        expect.objectContaining({ method: "PUT", body: { update: true } }),
        undefined
      );
    });

    it("httpPatch sends PATCH request with body", async () => {
      await httpPatch("/item", { patch: true });
      expect(mockHttpRequest).toHaveBeenCalledWith(
        "/item",
        expect.objectContaining({ method: "PATCH", body: { patch: true } }),
        undefined
      );
    });
  });
});
