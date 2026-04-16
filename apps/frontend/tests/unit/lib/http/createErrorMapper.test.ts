import { describe, expect, it } from "vitest";

import { createErrorMapper } from "@/lib/http/serviceErrorFactory";

describe("createErrorMapper", () => {
  const mapper = createErrorMapper(
    (
      message: string,
      status: number,
      code?: string,
      details?: Record<string, unknown>
    ) => Object.assign(new Error(message), { status, code, details }),
    { 400: "Bad Request", 404: "Not Found", 500: "Server Error" },
    "Default error"
  );

  it("should extract status from error.status", () => {
    const result = mapper({ status: 404, message: "Resource not found" });
    expect(result.status).toBe(404);
    expect(result.message).toBe("Not Found");
  });

  it("should extract status from nested error.response.status", () => {
    const result = mapper({
      response: { status: 400 },
      message: "Invalid input",
    });
    expect(result.status).toBe(400);
    expect(result.message).toBe("Bad Request");
  });

  it("should default to status 500 when no status is present", () => {
    const result = mapper({ message: "Something went wrong" });
    expect(result.status).toBe(500);
  });

  it("should fall back to error.message for unknown status codes", () => {
    const result = mapper({ status: 422, message: "Unprocessable Entity" });
    expect(result.status).toBe(422);
    expect(result.message).toBe("Unprocessable Entity");
  });

  it("should use default message when no message is available", () => {
    const result = mapper({ status: 503 });
    expect(result.status).toBe(503);
    expect(result.message).toBe("Default error");
  });

  it("should extract code field when present", () => {
    const result = mapper({ status: 400, code: "VALIDATION_ERROR" });
    expect(result.code).toBe("VALIDATION_ERROR");
  });

  it("should extract details field when present", () => {
    const result = mapper({
      status: 400,
      details: { field: "email", reason: "invalid format" },
    });
    expect(result.details).toEqual({
      field: "email",
      reason: "invalid format",
    });
  });

  it("should handle non-object errors with defaults", () => {
    const stringResult = mapper("error string");
    expect(stringResult.status).toBe(500);
    expect(stringResult.message).toBe("Server Error");

    const nullResult = mapper(null);
    expect(nullResult.status).toBe(500);
    expect(nullResult.message).toBe("Server Error");

    const undefinedResult = mapper(undefined);
    expect(undefinedResult.status).toBe(500);
    expect(undefinedResult.message).toBe("Server Error");
  });
});
