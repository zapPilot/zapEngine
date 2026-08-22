import { TOKEN_BRAND, tokenBrandSymbolFor } from '@zapengine/brand-assets';
import Image from 'next/image';

import { TOKEN_ICON_SRC } from '@/data/assetIcons';

interface TokenIconProps {
  symbol: string;
  size?: number;
}

export function TokenIcon({ symbol, size = 18 }: TokenIconProps) {
  const brandSymbol = tokenBrandSymbolFor(symbol);
  const brand = brandSymbol ? TOKEN_BRAND[brandSymbol] : undefined;
  const source = brandSymbol ? TOKEN_ICON_SRC[brandSymbol] : undefined;

  if (source) {
    return (
      <Image
        alt=""
        className="token-icon"
        height={size}
        src={source}
        width={size}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="token-icon token-icon-glyph"
      style={{
        backgroundColor: brand?.color ?? 'rgba(255, 255, 255, 0.1)',
        height: size,
        width: size,
      }}
    >
      {brand?.glyph ?? symbol.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}
