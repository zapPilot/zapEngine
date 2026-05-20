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

function withBaseURL<Config extends Record<string, unknown> | undefined>(
  baseURL: string,
  config: Config,
): Record<string, unknown> {
  return {
    ...(config ?? {}),
    baseURL,
  };
}

function createServiceHttpClient(baseURL: string) {
  const withBase = <C extends Record<string, unknown> | undefined>(
    config?: C,
  ) => withBaseURL(baseURL, config) as C;

  const mutate = <T>(
    fn: (
      url: string,
      body: unknown,
      config: Record<string, unknown>,
      transformer?: ResponseTransformer<T>,
    ) => Promise<T>,
    endpoint: string,
    body: unknown,
    config?: MutateConfig,
    transformer?: ResponseTransformer<T>,
  ) => fn(endpoint, body, withBase(config), transformer);

  const mutator =
    (fn: typeof httpPost) =>
    <T = unknown>(
      endpoint: string,
      body?: unknown,
      config?: MutateConfig,
      transformer?: ResponseTransformer<T>,
    ) =>
      mutate(fn, endpoint, body, config, transformer);

  return {
    get: <T = unknown>(
      endpoint: string,
      config?: GetConfig,
      transformer?: ResponseTransformer<T>,
    ) => httpGet(endpoint, withBase(config), transformer),

    post: mutator(httpPost),

    put: mutator(httpPut),

    patch: mutator(httpPatch),

    delete: <T = unknown>(
      endpoint: string,
      config?: GetConfig,
      transformer?: ResponseTransformer<T>,
    ) => httpDelete(endpoint, withBase(config), transformer),
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
