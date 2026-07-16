import { fileURLToPath } from 'node:url';

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
} as const;
