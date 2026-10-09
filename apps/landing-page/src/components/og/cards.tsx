import { ImageResponse } from 'next/og';
import { PITCH_OG } from '@/config/pitch';
import { OgCard, ogFonts, ogSize } from './OgCard';

// Shared by the Open Graph and Twitter image routes. Each route still exports
// its own literal segment config, which Next reads statically.
export function renderHomeOgImage() {
  return new ImageResponse(
    <OgCard
      label="Programmable portfolios"
      url="zap-pilot.org"
      footer="OPEN SOURCE · NO ZAP PILOT VAULT"
    />,
    { ...ogSize, fonts: ogFonts },
  );
}

export function renderPitchOgImage() {
  return new ImageResponse(
    <OgCard
      label={PITCH_OG.label}
      url={PITCH_OG.url}
      footer={PITCH_OG.footer}
    />,
    { ...ogSize, fonts: ogFonts },
  );
}
