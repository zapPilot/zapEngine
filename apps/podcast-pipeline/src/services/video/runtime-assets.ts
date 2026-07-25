import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { BGM_TRACK_IDS } from './manifest.js';

const videoAssetsUrl = new URL('../../../assets/video/', import.meta.url);

export const videoAssetPaths = {
  root: fileURLToPath(videoAssetsUrl),
  fontsDirectory: fileURLToPath(new URL('fonts/', videoAssetsUrl)),
  notoSansCjkTcRegular: fileURLToPath(
    new URL('fonts/NotoSansCJKtc-Regular.otf', videoAssetsUrl),
  ),
  notoSansCjkTcBold: fileURLToPath(
    new URL('fonts/NotoSansCJKtc-Bold.otf', videoAssetsUrl),
  ),
  jetBrainsMonoSemibold: fileURLToPath(
    new URL('fonts/JetBrainsMono-SemiBold.ttf', videoAssetsUrl),
  ),
  logo: fileURLToPath(new URL('brand/zap-pilot-logo.svg', videoAssetsUrl)),
  usStatesMap: fileURLToPath(new URL('maps/us-states-cc0.svg', videoAssetsUrl)),
  musicDirectory: fileURLToPath(new URL('music/', videoAssetsUrl)),
} as const;

export type BgmTrackId = (typeof BGM_TRACK_IDS)[number];

export function bgmTrackPath(trackId: BgmTrackId): string {
  if (!BGM_TRACK_IDS.includes(trackId)) {
    throw new Error(`Unknown BGM track: ${String(trackId)}`);
  }
  return fileURLToPath(new URL(`music/${trackId}.mp3`, videoAssetsUrl));
}

// The same episode keeps the same track across all three locale renders.
export function pickBgmTrack(episodeId: string): BgmTrackId {
  const digest = createHash('sha256').update(episodeId).digest();
  const index = (digest[0] ?? 0) % BGM_TRACK_IDS.length;
  return BGM_TRACK_IDS[index] ?? BGM_TRACK_IDS[0];
}
