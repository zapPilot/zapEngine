export function signedCount(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '—';
  }
  if (value === 0) {
    return '±0';
  }
  return `${value > 0 ? '+' : '-'}${Math.abs(value).toLocaleString('en-US')}`;
}
