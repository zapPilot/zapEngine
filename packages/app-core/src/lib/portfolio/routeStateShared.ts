export function isMember<TValue extends string>(
  values: readonly TValue[],
  value: string | null,
): value is TValue {
  return value !== null && values.includes(value as TValue);
}
