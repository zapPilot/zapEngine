interface TokenIconProps {
  glyph: string;
  bg: string;
  size?: number;
}

/** Circular token icon with a single-glyph fallback (USDC $, ETH Ξ, …). */
export function TokenIcon({ glyph, bg, size = 38 }: TokenIconProps) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        background: bg,
        fontSize: size * 0.45,
      }}
    >
      {glyph}
    </span>
  );
}
