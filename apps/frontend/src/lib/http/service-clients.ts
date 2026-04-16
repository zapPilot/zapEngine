/**
 * Service HTTP Clients
 * Pre-configured HTTP clients for each API service
 */

import {
  API_ENDPOINTS,
  type HttpRequestConfig,
  type ResponseTransformer,
} from "./config";
import { httpDelete, httpGet, httpPatch, httpPost, httpPut } from "./methods";

type GetConfig = Omit<HttpRequestConfig, "method" | "body">;
type MutateConfig = Omit<HttpRequestConfig, "method">;

function withBaseURL<Config extends Record<string, unknown> | undefined>(
  baseURL: string,
  config: Config
): Record<string, unknown> {
  return {
    ...(config ?? {}),
    baseURL,
  };
}

function createServiceHttpClient(baseURL: string) {
  // Helper to wrap config with baseURL
  const withBase = <C extends Record<string, unknown> | undefined>(
    config?: C
  ) => withBaseURL(baseURL, config) as C;

  return {
    get: <T = unknown>(
      endpoint: string,
      config?: GetConfig,
      transformer?: ResponseTransformer<T>
    ) => httpGet(endpoint, withBase(config), transformer),

    post: <T = unknown>(
      endpoint: string,
      body?: unknown,
      config?: MutateConfig,
      transformer?: ResponseTransformer<T>
    ) => httpPost(endpoint, body, withBase(config), transformer),

    put: <T = unknown>(
      endpoint: string,
      body?: unknown,
      config?: MutateConfig,
      transformer?: ResponseTransformer<T>
    ) => httpPut(endpoint, body, withBase(config), transformer),

    patch: <T = unknown>(
      endpoint: string,
      body?: unknown,
      config?: MutateConfig,
      transformer?: ResponseTransformer<T>
    ) => httpPatch(endpoint, body, withBase(config), transformer),

    delete: <T = unknown>(
      endpoint: string,
      config?: GetConfig,
      transformer?: ResponseTransformer<T>
    ) => httpDelete(endpoint, withBase(config), transformer),
  } as const;
}

export const httpUtils = {
  /**
   * Analytics Engine API utilities
   */
  analyticsEngine: createServiceHttpClient(API_ENDPOINTS.analyticsEngine),

  /**
   * Intent Engine API utilities
   */
  intentEngine: createServiceHttpClient(API_ENDPOINTS.intentEngine),

  /**
   * Backend API utilities
   */
  backendApi: createServiceHttpClient(API_ENDPOINTS.backendApi),

  /**
   * Account API utilities
   */
  accountApi: createServiceHttpClient(API_ENDPOINTS.accountApi),

  /**
   * DeBank Open API utilities
   */
  debank: createServiceHttpClient(API_ENDPOINTS.debank),
} as const;
