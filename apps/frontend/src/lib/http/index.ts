/**
 * HTTP Utilities - Barrel Export
 * Maintains backward compatibility with original http-utils.ts API
 */

// Configuration
export { API_ENDPOINTS } from "./config";

// Errors
export { APIError, NetworkError, TimeoutError } from "./errors";
export { handleHTTPError } from "./http-error-handler";

// HTTP methods
export { httpGet, httpPost } from "./methods";

// Service clients
export { httpUtils } from "./service-clients";

// Service utilities
export {
  createApiServiceCaller,
  createServiceCaller,
} from "./createServiceCaller";
export { createErrorMapper } from "./serviceErrorFactory";
