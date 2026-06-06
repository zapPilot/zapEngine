/**
 * Service HTTP Clients
 * Pre-configured HTTP clients for each API service
 */

import {
  API_ENDPOINTS,
  type HttpRequestConfig,
  type ResponseTransformer,
} from './config';
import { httpDelete, httpGet, httpPatch, httpPost, httpPut } from './methods';

type GetConfig = Omit<HttpRequestConfig, 'method' | 'body'>;
type MutateConfig = Omit<HttpRequestConfig, 'method'>;

function createServiceHttpClient(baseURL: string) {
  const withBase = <C extends GetConfig | MutateConfig>(config?: C): C =>
    ({ ...config, baseURL }) as C;

  const query =
    (fn: typeof httpGet) =>
    <T = unknown>(
      endpoint: string,
      config?: GetConfig,
      transformer?: ResponseTransformer<T>,
    ) =>
      fn(endpoint, withBase(config), transformer);

  const mutation =
    (fn: typeof httpPost) =>
    <T = unknown>(
      endpoint: string,
      body?: unknown,
      config?: MutateConfig,
      transformer?: ResponseTransformer<T>,
    ) =>
      fn(endpoint, body, withBase(config), transformer);

  return {
    get: query(httpGet),
    post: mutation(httpPost),
    put: mutation(httpPut),
    patch: mutation(httpPatch),
    delete: query(httpDelete),
  } as const;
}

export const httpUtils = {
  /**
   * Analytics Engine API utilities
   */
  analyticsEngine: createServiceHttpClient(API_ENDPOINTS.analyticsEngine),

  /**
   * Account API utilities
   */
  accountApi: createServiceHttpClient(API_ENDPOINTS.accountApi),

  /**
   * DeBank Open API utilities
   */
  debank: createServiceHttpClient(API_ENDPOINTS.debank),
} as const;
