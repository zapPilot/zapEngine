/**
 * HTTP Error Classes
 * Error types and error response parsing
 */

// Error classes
export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "APIError";
  }
}

export class NetworkError extends Error {
  constructor(message = "Network connection failed") {
    super(message);
    this.name = "NetworkError";
  }
}

export class TimeoutError extends Error {
  constructor(message = "Request timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

// Error response parsing utility
export async function parseErrorResponse(response: Response): Promise<{
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}> {
  try {
    const data = await response.json();
    return {
      message: data.message || data.error || `HTTP ${response.status}`,
      code: data.code,
      details: data.details || data,
    };
  } catch {
    return {
      message: `HTTP ${response.status}`,
    };
  }
}

/**
 * Convert unknown errors to Error instances
 */
export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string") {
    return new Error(error);
  }

  if (error && typeof error === "object") {
    const errorObj = error as Record<string, unknown>;
    return new Error((errorObj["message"] as string) || "Unknown error");
  }

  return new Error("Unknown error occurred");
}
