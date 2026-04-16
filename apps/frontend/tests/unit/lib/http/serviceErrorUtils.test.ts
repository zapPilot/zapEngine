import { describe, expect, it } from "vitest";

import { ServiceError } from "@/lib/errors/ServiceError";
import {
  createServiceError,
  isApiErrorResponse,
} from "@/lib/http/serviceErrorUtils";

const DEFAULT_MESSAGE = "Default message";

function createTestServiceError(error: unknown): ServiceError {
  return createServiceError(error, ServiceError, DEFAULT_MESSAGE);
}

describe("isApiErrorResponse", () => {
  it("returns true for plain objects", () => {
    const result = isApiErrorResponse({ message: "error", status: 400 });
    expect(result).toBe(true);
  });

  it("returns true for Error instances", () => {
    const error = new Error("test error");
    const result = isApiErrorResponse(error);
    expect(result).toBe(true);
  });

  it("returns false for null", () => {
    const result = isApiErrorResponse(null);
    expect(result).toBe(false);
  });

  it("returns false for undefined", () => {
    const result = isApiErrorResponse(undefined);
    expect(result).toBe(false);
  });

  it("returns false for string", () => {
    const result = isApiErrorResponse("error string");
    expect(result).toBe(false);
  });

  it("returns false for number", () => {
    const result = isApiErrorResponse(404);
    expect(result).toBe(false);
  });
});

describe("createServiceError", () => {
  it("creates error from API error with status and message", () => {
    const apiError = {
      message: "Not found",
      status: 404,
    };

    const result = createTestServiceError(apiError);

    expect(result).toBeInstanceOf(ServiceError);
    expect(result.message).toBe("Not found");
    expect(result.status).toBe(404);
    expect(result.name).toBe("ServiceError");
  });

  it("creates error using response.status when status is missing", () => {
    const apiError = {
      message: "Server error",
      response: { status: 503 },
    };

    const result = createTestServiceError(apiError);

    expect(result.status).toBe(503);
    expect(result.message).toBe("Server error");
  });

  it("defaults to 500 when no status available", () => {
    const apiError = {
      message: "Unknown error",
    };

    const result = createTestServiceError(apiError);

    expect(result.status).toBe(500);
    expect(result.message).toBe("Unknown error");
  });

  it("uses defaultMessage when error has no message", () => {
    const apiError = {
      status: 400,
    };

    const result = createTestServiceError(apiError);

    expect(result.message).toBe(DEFAULT_MESSAGE);
    expect(result.status).toBe(400);
  });

  it("applies enhanceMessage function when provided", () => {
    const apiError = {
      message: "Not found",
      status: 404,
    };

    const enhanceMessage = (status: number, message: string) =>
      `[${status}] ${message.toUpperCase()}`;

    const result = createServiceError(
      apiError,
      ServiceError,
      DEFAULT_MESSAGE,
      enhanceMessage
    );

    expect(result.message).toBe("[404] NOT FOUND");
  });

  it("handles null error and uses defaultMessage and status 500", () => {
    const result = createTestServiceError(null);

    expect(result.message).toBe(DEFAULT_MESSAGE);
    expect(result.status).toBe(500);
    expect(result.code).toBeUndefined();
    expect(result.details).toBeUndefined();
  });

  it("handles string error and uses defaultMessage, status 500", () => {
    const result = createTestServiceError("string error");

    expect(result.message).toBe(DEFAULT_MESSAGE);
    expect(result.status).toBe(500);
    expect(result.code).toBeUndefined();
    expect(result.details).toBeUndefined();
  });

  it("extracts code and details from error object", () => {
    const apiError = {
      message: "Validation failed",
      status: 422,
      code: "VALIDATION_ERROR",
      details: {
        field: "email",
        issue: "invalid format",
      },
    };

    const result = createTestServiceError(apiError);

    expect(result.code).toBe("VALIDATION_ERROR");
    expect(result.details).toEqual({
      field: "email",
      issue: "invalid format",
    });
  });

  it("does not extract code/details from non-object errors", () => {
    const result = createTestServiceError("string error");

    expect(result.code).toBeUndefined();
    expect(result.details).toBeUndefined();
  });
});
