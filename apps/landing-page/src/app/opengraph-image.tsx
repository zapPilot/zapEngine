import { renderHomeOgImage } from '@/components/og/cards';
import { ogSize, ogContentType } from '@/components/og/OgCard';
export const alt = 'Zap Pilot — Your strategy. Your machine. Your wallet.';
export const size = ogSize;
export const contentType = ogContentType;
// Next statically analyzes these literal route configs in each entrypoint.
// jscpd:ignore-start -- Required framework declarations; card metadata is shared.
export const dynamic = 'force-static';
export const revalidate = false;
// jscpd:ignore-end
export default function OpenGraphImage() {
  return renderHomeOgImage();
}
