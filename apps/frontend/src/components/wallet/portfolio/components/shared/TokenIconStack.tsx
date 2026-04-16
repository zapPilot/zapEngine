import { IconBadge } from "./IconBadge";

interface TokenIconStackProps {
  /** Token list with symbols */
  tokens: { symbol: string }[];
  /** Maximum tokens to show before "+N" indicator */
  maxVisible?: number;
}

/**
 * Horizontal token list with icon + symbol text.
 * Shows first N tokens with icons and labels, remaining as "+N more" text.
 *
 * UI Pattern: [ICON] Symbol, [ICON] Symbol, [ICON] Symbol
 */
export function TokenIconStack({
  tokens,
  maxVisible = 3,
}: TokenIconStackProps) {
  const visible = tokens.slice(0, maxVisible);
  const remaining = tokens.length - maxVisible;

  return (
    <div className="flex items-center flex-wrap gap-2">
      {/* Token list with icon + symbol text */}
      {visible.map(token => (
        <div key={token.symbol} className="flex items-center gap-1">
          {/* Token Icon */}
          <IconBadge
            src={`https://zap-assets-worker.davidtnfsh.workers.dev/tokenPictures/${token.symbol.toLowerCase()}.webp`}
            alt={`${token.symbol} icon`}
            size="sm"
            fallback={{ type: "letter", content: token.symbol }}
          />
          {/* Token Symbol Text */}
          <span className="text-xs text-gray-300 font-medium">
            {token.symbol}
          </span>
        </div>
      ))}

      {/* "+N more" indicator */}
      {remaining > 0 && (
        <span className="text-xs text-gray-400">+{remaining} more</span>
      )}
    </div>
  );
}
