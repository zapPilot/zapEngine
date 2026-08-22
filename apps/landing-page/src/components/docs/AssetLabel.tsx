import { TokenIcon } from '@/components/brand/icons';

export function AssetLabel({
  label,
  size = 16,
  symbol,
}: {
  label?: string;
  size?: number;
  symbol: string;
}) {
  return (
    <span
      className="not-prose"
      style={{
        alignItems: 'center',
        display: 'inline-flex',
        gap: 6,
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
      }}
    >
      <TokenIcon symbol={symbol} size={size} />
      <span>{label ?? symbol}</span>
    </span>
  );
}

export function AssetPairLabel({
  first,
  label,
  second,
  size = 16,
}: {
  first: string;
  label?: string;
  second: string;
  size?: number;
}) {
  return (
    <span
      className="not-prose"
      style={{
        alignItems: 'center',
        display: 'inline-flex',
        gap: 6,
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ alignItems: 'center', display: 'inline-flex', gap: 2 }}>
        <TokenIcon symbol={first} size={size} />
        <TokenIcon symbol={second} size={size} />
      </span>
      <span>{label ?? `${first} / ${second}`}</span>
    </span>
  );
}
