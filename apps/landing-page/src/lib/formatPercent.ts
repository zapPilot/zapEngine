const UNICODE_MINUS = '\u2212';

type SignedPercent = false | 'ascii' | 'unicode';

export function formatPercent(
  value: number,
  {
    scale,
    signed,
  }: {
    scale: number;
    signed: SignedPercent;
  },
): string {
  const scaled = value * scale;
  if (signed === 'unicode') {
    const sign = scaled < 0 ? UNICODE_MINUS : '+';
    return `${sign}${Math.abs(scaled).toFixed(2)}%`;
  }
  const sign = signed === 'ascii' && scaled >= 0 ? '+' : '';
  return `${sign}${scaled.toFixed(2)}%`;
}
