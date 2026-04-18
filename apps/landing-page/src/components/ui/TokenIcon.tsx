import Image from 'next/image';

export type TokenSymbol = 'btc' | 'eth' | 'usdc';

interface TokenIconProps {
  token: TokenSymbol;
  size?: number | 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_MAP = {
  sm: 16,
  md: 20,
  lg: 24,
} as const;

/**
 * Renders a single token icon
 * @param token - Token symbol (btc, eth, usdc)
 * @param size - Icon size (numeric or preset: sm/md/lg)
 * @param className - Additional CSS classes
 */
export function TokenIcon({ token, size = 'md', className = '' }: TokenIconProps) {
  const dimension = typeof size === 'number' ? size : SIZE_MAP[size];

  return (
    <Image
      src={`/${token}.webp`}
      alt={token.toUpperCase()}
      width={dimension}
      height={dimension}
      className={`rounded-full ${className}`}
    />
  );
}

interface TokenPairProps {
  tokens: [TokenSymbol, TokenSymbol];
  size?: number | 'sm' | 'md' | 'lg';
  className?: string;
  /** Use more aggressive overlap for compact mobile layouts */
  overlap?: boolean;
}

/**
 * Renders two overlapping token icons
 * @param tokens - Tuple of two token symbols
 * @param size - Icon size (numeric or preset: sm/md/lg)
 * @param className - Additional CSS classes for the container
 * @param overlap - Use more aggressive overlap for mobile
 */
export function TokenPair({
  tokens,
  size = 'md',
  className = '',
  overlap = false,
}: TokenPairProps) {
  return (
    <div className={`flex ${overlap ? '-space-x-2' : '-space-x-1'} ${className}`}>
      <TokenIcon token={tokens[0]} size={size} />
      <TokenIcon token={tokens[1]} size={size} />
    </div>
  );
}
