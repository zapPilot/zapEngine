interface ZapLogoProps {
  size?: number;
}

/** The Zap Pilot three-bar mark (warm gold), from the POC design. */
export function ZapLogo({ size = 16 }: ZapLogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.5" y="7.5" width="3" height="7" rx="1.2" fill="#d4c5a3" />
      <rect x="6.5" y="3.5" width="3" height="11" rx="1.2" fill="#d4c5a3" />
      <rect x="11.5" y="9.5" width="3" height="5" rx="1.2" fill="#9a8f78" />
    </svg>
  );
}
