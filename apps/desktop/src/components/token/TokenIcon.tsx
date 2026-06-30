import { TOKEN_ICON_SRC_BY_SYMBOL } from '@/data/assetIcons';

const ICON_BY_BG: Record<string, string> = {
  '#2775ca': TOKEN_ICON_SRC_BY_SYMBOL.USDC,
  '#26a17b': TOKEN_ICON_SRC_BY_SYMBOL.USDT,
  '#2a2a30': TOKEN_ICON_SRC_BY_SYMBOL.ETH,
  '#627eea': TOKEN_ICON_SRC_BY_SYMBOL.WETH,
  '#f7931a': TOKEN_ICON_SRC_BY_SYMBOL.WBTC,
  '#0052ff': TOKEN_ICON_SRC_BY_SYMBOL.CBBTC,
};

interface TokenIconProps {
  glyph: string;
  bg: string;
  size?: number;
  src?: string;
  alt?: string;
}

/** Circular token icon with committed asset support and a glyph fallback. */
export function TokenIcon({
  alt = '',
  glyph,
  bg,
  size = 38,
  src,
}: TokenIconProps) {
  const iconSrc = src ?? ICON_BY_BG[bg.toLowerCase()];

  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        background: iconSrc ? 'rgba(255,255,255,.06)' : bg,
        fontSize: size * 0.45,
        overflow: 'hidden',
      }}
    >
      {iconSrc ? (
        <img
          src={iconSrc}
          alt={alt}
          className="h-full w-full"
          draggable={false}
        />
      ) : (
        glyph
      )}
    </span>
  );
}
