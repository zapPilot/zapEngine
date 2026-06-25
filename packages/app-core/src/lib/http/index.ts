/**
 * HTTP Utilities - Barrel Export
 * Maintains backward compatibility with original http-utils.ts API
 */

// Configuration
export { API_ENDPOINTS } from './config';

// Errors
export { APIError, NetworkError, TimeoutError } from './errors';
export { handleHTTPError } from './httpErrorHandler';

// HTTP methods
export { httpGet, httpPost } from './methods';

// Service clients
export { httpUtils } from './serviceClients';

// Service utilities
export {
  createApiServiceCaller,
  createServiceCaller,
} from './createServiceCaller';
export { createErrorMapper } from './serviceErrorFactory';
