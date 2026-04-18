import { describe, expect, it } from "vitest";

import { API_ENDPOINTS, HTTP_CONFIG } from "@/lib/http/config";

describe("API_ENDPOINTS", () => {
  it("has an analyticsEngine field (string)", () => {
    expect(typeof API_ENDPOINTS.analyticsEngine).toBe("string");
  });

  it("has an accountApi field (string)", () => {
    expect(typeof API_ENDPOINTS.accountApi).toBe("string");
  });

  it("has a debank field pointing to the known endpoint", () => {
    expect(API_ENDPOINTS.debank).toBe("https://pro-openapi.debank.com/v1");
  });
});

describe("HTTP_CONFIG", () => {
  it("has a numeric timeout value", () => {
    expect(typeof HTTP_CONFIG.timeout).toBe("number");
    expect(HTTP_CONFIG.timeout).toBeGreaterThan(0);
  });

  it("has retries set to 1", () => {
    expect(HTTP_CONFIG.retries).toBe(1);
  });

  it("has a retryDelay of 2000 ms", () => {
    expect(HTTP_CONFIG.retryDelay).toBe(2000);
  });

  it("has a timeout of 15000 in test/development mode (non-production)", () => {
    // In the test environment NODE_ENV is 'test', so isRuntimeMode('production') is false
    // → DEFAULT_TIMEOUT_MS should be 15000
    expect(HTTP_CONFIG.timeout).toBe(15000);
  });
});
