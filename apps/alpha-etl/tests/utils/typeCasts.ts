export function castTo<T>(value: unknown): T {
  return value as T;
}

export function accessPrivate<TPublic, TPrivate extends object>(value: TPublic): TPublic & TPrivate {
  return value as TPublic & TPrivate;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}
