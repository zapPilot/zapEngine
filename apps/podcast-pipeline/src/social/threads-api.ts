export function parseThreadsApiJson(raw: string): unknown {
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function describeThreadsApiError(
  status: number,
  body: unknown,
  rawFallback?: string,
): string {
  if (isRecord(body) && isRecord(body['error'])) {
    const message = body['error']['message'];
    if (nonemptyString(message)) {
      return `Threads API ${status}: ${message.trim()}`;
    }
  }
  return `Threads API ${status}: ${rawFallback?.trim() || 'request failed'}`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function nonemptyString(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim());
}
