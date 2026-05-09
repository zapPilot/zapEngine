export function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function readNullableString(value: unknown): string | null {
  const text = readString(value);
  return text || null;
}
