/**
 * Service Clients Unit Tests
 *
 * Tests for the pre-configured HTTP clients
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Import after mocking
import * as methods from "@/lib/http/methods";
import { httpUtils } from "@/lib/http/service-clients";

// Mock the methods module
vi.mock("@/lib/http/methods", () => ({
  httpGet: vi.fn(),
  httpPost: vi.fn(),
  httpPut: vi.fn(),
  httpPatch: vi.fn(),
  httpDelete: vi.fn(),
}));

const mockHttpGet = vi.mocked(methods.httpGet);
const mockHttpPost = vi.mocked(methods.httpPost);
const mockHttpPut = vi.mocked(methods.httpPut);
const mockHttpPatch = vi.mocked(methods.httpPatch);
const mockHttpDelete = vi.mocked(methods.httpDelete);

describe("httpUtils service clients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHttpGet.mockResolvedValue({ data: "test" });
    mockHttpPost.mockResolvedValue({ data: "test" });
    mockHttpPut.mockResolvedValue({ data: "test" });
    mockHttpPatch.mockResolvedValue({ data: "test" });
    mockHttpDelete.mockResolvedValue({ data: "test" });
  });

  describe("analyticsEngine", () => {
    it("should have get method", async () => {
      await httpUtils.analyticsEngine.get("/test");
      expect(mockHttpGet).toHaveBeenCalledWith(
        "/test",
        expect.objectContaining({ baseURL: expect.any(String) }),
        undefined
      );
    });

    it("should pass config to get method", async () => {
      const config = { headers: { "X-Custom": "value" } };
      await httpUtils.analyticsEngine.get("/test", config);
      expect(mockHttpGet).toHaveBeenCalledWith(
        "/test",
        expect.objectContaining({
          baseURL: expect.any(String),
          headers: { "X-Custom": "value" },
        }),
        undefined
      );
    });

    it("should have post method", async () => {
      await httpUtils.analyticsEngine.post("/test", { key: "value" });
      expect(mockHttpPost).toHaveBeenCalledWith(
        "/test",
        { key: "value" },
        expect.objectContaining({ baseURL: expect.any(String) }),
        undefined
      );
    });

    it("should have put method", async () => {
      await httpUtils.analyticsEngine.put("/test", { key: "value" });
      expect(mockHttpPut).toHaveBeenCalledWith(
        "/test",
        { key: "value" },
        expect.objectContaining({ baseURL: expect.any(String) }),
        undefined
      );
    });

    it("should have patch method", async () => {
      await httpUtils.analyticsEngine.patch("/test", { key: "value" });
      expect(mockHttpPatch).toHaveBeenCalledWith(
        "/test",
        { key: "value" },
        expect.objectContaining({ baseURL: expect.any(String) }),
        undefined
      );
    });

    it("should have delete method", async () => {
      await httpUtils.analyticsEngine.delete("/test");
      expect(mockHttpDelete).toHaveBeenCalledWith(
        "/test",
        expect.objectContaining({ baseURL: expect.any(String) }),
        undefined
      );
    });
  });

  describe("intentEngine", () => {
    it("should use correct base URL for get", async () => {
      await httpUtils.intentEngine.get("/intent");
      expect(mockHttpGet).toHaveBeenCalledWith(
        "/intent",
        expect.objectContaining({ baseURL: expect.any(String) }),
        undefined
      );
    });

    it("should use correct base URL for post", async () => {
      await httpUtils.intentEngine.post("/intent", { action: "swap" });
      expect(mockHttpPost).toHaveBeenCalledWith(
        "/intent",
        { action: "swap" },
        expect.objectContaining({ baseURL: expect.any(String) }),
        undefined
      );
    });
  });

  describe("backendApi", () => {
    it("should use correct base URL", async () => {
      await httpUtils.backendApi.get("/v1/users");
      expect(mockHttpGet).toHaveBeenCalledWith(
        "/v1/users",
        expect.objectContaining({ baseURL: expect.any(String) }),
        undefined
      );
    });

    it("should support post with body", async () => {
      await httpUtils.backendApi.post("/v1/notifications", { type: "email" });
      expect(mockHttpPost).toHaveBeenCalled();
    });
  });

  describe("accountApi", () => {
    it("should use correct base URL", async () => {
      await httpUtils.accountApi.get("/users/123");
      expect(mockHttpGet).toHaveBeenCalledWith(
        "/users/123",
        expect.objectContaining({ baseURL: expect.any(String) }),
        undefined
      );
    });

    it("should support delete method", async () => {
      await httpUtils.accountApi.delete("/users/123/wallets/456");
      expect(mockHttpDelete).toHaveBeenCalled();
    });
  });

  describe("debank", () => {
    it("should use correct base URL", async () => {
      await httpUtils.debank.get("/user/total_balance?id=0x123");
      expect(mockHttpGet).toHaveBeenCalledWith(
        "/user/total_balance?id=0x123",
        expect.objectContaining({ baseURL: expect.any(String) }),
        undefined
      );
    });
  });

  describe("transformer support", () => {
    it("should pass transformer to get", async () => {
      const transformer = (data: unknown) => ({ transformed: data });
      await httpUtils.analyticsEngine.get("/test", undefined, transformer);
      expect(mockHttpGet).toHaveBeenCalledWith(
        "/test",
        expect.objectContaining({ baseURL: expect.any(String) }),
        transformer
      );
    });

    it("should pass transformer to post", async () => {
      const transformer = (data: unknown) => ({ transformed: data });
      await httpUtils.analyticsEngine.post("/test", {}, undefined, transformer);
      expect(mockHttpPost).toHaveBeenCalledWith(
        "/test",
        {},
        expect.objectContaining({ baseURL: expect.any(String) }),
        transformer
      );
    });

    it("should pass transformer to put", async () => {
      const transformer = (data: unknown) => ({ transformed: data });
      await httpUtils.analyticsEngine.put("/test", {}, undefined, transformer);
      expect(mockHttpPut).toHaveBeenCalledWith(
        "/test",
        {},
        expect.objectContaining({ baseURL: expect.any(String) }),
        transformer
      );
    });

    it("should pass transformer to patch", async () => {
      const transformer = (data: unknown) => ({ transformed: data });
      await httpUtils.analyticsEngine.patch(
        "/test",
        {},
        undefined,
        transformer
      );
      expect(mockHttpPatch).toHaveBeenCalledWith(
        "/test",
        {},
        expect.objectContaining({ baseURL: expect.any(String) }),
        transformer
      );
    });

    it("should pass transformer to delete", async () => {
      const transformer = (data: unknown) => ({ transformed: data });
      await httpUtils.analyticsEngine.delete("/test", undefined, transformer);
      expect(mockHttpDelete).toHaveBeenCalledWith(
        "/test",
        expect.objectContaining({ baseURL: expect.any(String) }),
        transformer
      );
    });
  });
});
