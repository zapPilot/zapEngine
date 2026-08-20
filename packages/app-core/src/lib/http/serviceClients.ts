/**
 * Service HTTP Clients
 * Pre-configured HTTP clients for each API service
 */

import { API_ENDPOINTS, type HttpRequestConfig } from './config';
import { httpDelete, httpGet, httpPost, httpPut } from './methods';

type GetConfig = Omit<HttpRequestConfig, 'method' | 'body'>;
type MutateConfig = Omit<HttpRequestConfig, 'method'>;

// Base URLs are resolved per request (not captured at module scope) so the
// env injected at app bootstrap (configureAppCoreEnv) is honored.
function createServiceHttpClient(resolveBaseURL: () => string) {
  const withBase = <C extends GetConfig | MutateConfig>(config?: C): C =>
    ({ ...config, baseURL: resolveBaseURL() }) as C;

  const query =
    (fn: typeof httpGet) =>
    <T = unknown>(endpoint: string, config?: GetConfig) =>
      fn<T>(endpoint, withBase(config));

  const mutation =
    (fn: typeof httpPost) =>
    <T = unknown>(endpoint: string, body?: unknown, config?: MutateConfig) =>
      fn<T>(endpoint, body, withBase(config));

  return {
    get: query(httpGet),
    post: mutation(httpPost),
    put: mutation(httpPut),
    delete: query(httpDelete),
  } as const;
}

export const httpUtils = {
  /**
   * Analytics Engine API utilities
   */
  analyticsEngine: createServiceHttpClient(() => API_ENDPOINTS.analyticsEngine),

  /**
   * Account API utilities
   */
  accountApi: createServiceHttpClient(() => API_ENDPOINTS.accountApi),
} as const;
