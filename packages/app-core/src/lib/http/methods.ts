/**
 * HTTP Method Wrappers
 * Convenience functions for GET, POST, PUT, DELETE requests
 */

import type { HTTPMethod, HttpRequestConfig } from './config';
import { httpRequest } from './request';

function buildUrl(endpoint: string, baseURL?: string): string {
  return baseURL ? `${baseURL}${endpoint}` : endpoint;
}

function requestWithMethod<T>(
  method: HTTPMethod,
  endpoint: string,
  config: Partial<HttpRequestConfig>,
  body?: unknown,
): Promise<T> {
  const url = buildUrl(endpoint, config.baseURL);
  const requestConfig: HttpRequestConfig = { ...config, method };

  if (body !== undefined) {
    requestConfig.body = body;
  }

  return httpRequest(url, requestConfig);
}

// --- Factory Functions ---

type QueryFunction = <T = unknown>(
  endpoint: string,
  config?: Omit<HttpRequestConfig, 'method' | 'body'>,
) => Promise<T>;

type MutationFunction = <T = unknown>(
  endpoint: string,
  body?: unknown,
  config?: Omit<HttpRequestConfig, 'method'>,
) => Promise<T>;

function createQuery(method: 'GET' | 'DELETE'): QueryFunction {
  const query: QueryFunction = (endpoint, config = {}) =>
    requestWithMethod(method, endpoint, config);
  return query;
}

function createMutation(method: 'POST' | 'PUT'): MutationFunction {
  const mutation: MutationFunction = (endpoint, body, config = {}) =>
    requestWithMethod(method, endpoint, config, body);
  return mutation;
}

// --- Exported Methods ---

export const httpGet = createQuery('GET');
export const httpDelete = createQuery('DELETE');

export const httpPost = createMutation('POST');
export const httpPut = createMutation('PUT');
