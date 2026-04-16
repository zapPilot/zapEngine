/**
 * Unit tests for HTTP error classes and utilities
 */
import { describe, expect, it } from "vitest";

import {
  APIError,
  NetworkError,
  parseErrorResponse,
  TimeoutError,
  toError,
} from "@/lib/http/errors";

describe("HTTP errors", () => {
  describe("APIError", () => {
    it("should create error with message and status", () => {
      const error = new APIError("Not found", 404);

      expect(error.message).toBe("Not found");
      expect(error.status).toBe(404);
      expect(error.name).toBe("APIError");
      expect(error.code).toBeUndefined();
      expect(error.details).toBeUndefined();
    });

    it("should create error with all properties", () => {
      const details = { field: "email", reason: "invalid" };
      const error = new APIError(
        "Validation failed",
        400,
        "VALIDATION_ERROR",
        details
      );

      expect(error.message).toBe("Validation failed");
      expect(error.status).toBe(400);
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.details).toEqual(details);
    });

    it("should be instance of Error", () => {
      const error = new APIError("Test", 500);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(APIError);
    });
  });

  describe("NetworkError", () => {
    it("should create with default message", () => {
      const error = new NetworkError();

      expect(error.message).toBe("Network connection failed");
      expect(error.name).toBe("NetworkError");
    });

    it("should create with custom message", () => {
      const error = new NetworkError("Connection refused");

      expect(error.message).toBe("Connection refused");
    });

    it("should be instance of Error", () => {
      const error = new NetworkError();

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(NetworkError);
    });
  });

  describe("TimeoutError", () => {
    it("should create with default message", () => {
      const error = new TimeoutError();

      expect(error.message).toBe("Request timed out");
      expect(error.name).toBe("TimeoutError");
    });

    it("should create with custom message", () => {
      const error = new TimeoutError("Operation timed out after 30s");

      expect(error.message).toBe("Operation timed out after 30s");
    });

    it("should be instance of Error", () => {
      const error = new TimeoutError();

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(TimeoutError);
    });
  });

  describe("parseErrorResponse", () => {
    it("should parse JSON response with message", async () => {
      const response = new Response(
        JSON.stringify({ message: "User not found", code: "USER_NOT_FOUND" }),
        { status: 404 }
      );

      const result = await parseErrorResponse(response);

      expect(result.message).toBe("User not found");
      expect(result.code).toBe("USER_NOT_FOUND");
    });

    it("should parse JSON response with error field", async () => {
      const response = new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401 }
      );

      const result = await parseErrorResponse(response);

      expect(result.message).toBe("Invalid token");
    });

    it("should parse JSON response with details", async () => {
      const details = { fields: ["email", "password"] };
      const response = new Response(
        JSON.stringify({ message: "Validation failed", details }),
        { status: 400 }
      );

      const result = await parseErrorResponse(response);

      expect(result.message).toBe("Validation failed");
      expect(result.details).toEqual(details);
    });

    it("should fallback to HTTP status when no message", async () => {
      const response = new Response(JSON.stringify({}), { status: 500 });

      const result = await parseErrorResponse(response);

      expect(result.message).toBe("HTTP 500");
    });

    it("should handle non-JSON response", async () => {
      const response = new Response("Internal Server Error", { status: 500 });

      const result = await parseErrorResponse(response);

      expect(result.message).toBe("HTTP 500");
    });

    it("should use response data as details when no details field", async () => {
      const data = { foo: "bar", baz: 123 };
      const response = new Response(JSON.stringify(data), { status: 400 });

      const result = await parseErrorResponse(response);

      expect(result.details).toEqual(data);
    });
  });

  describe("toError", () => {
    it("should return Error instance as-is", () => {
      const error = new Error("Test error");

      const result = toError(error);

      expect(result).toBe(error);
    });

    it("should convert string to Error", () => {
      const result = toError("Something went wrong");

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("Something went wrong");
    });

    it("should convert object with message to Error", () => {
      const obj = { message: "Custom error message", code: 123 };

      const result = toError(obj);

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("Custom error message");
    });

    it("should convert object without message to Error with default message", () => {
      const obj = { code: 123, details: "some details" };

      const result = toError(obj);

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("Unknown error");
    });

    it("should handle null", () => {
      const result = toError(null);

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("Unknown error occurred");
    });

    it("should handle undefined", () => {
      const result = toError(undefined);

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("Unknown error occurred");
    });

    it("should handle number", () => {
      const result = toError(42);

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe("Unknown error occurred");
    });

    it("should handle APIError subclass", () => {
      const error = new APIError("API failed", 500);

      const result = toError(error);

      expect(result).toBe(error);
      expect(result).toBeInstanceOf(APIError);
    });
  });
});
