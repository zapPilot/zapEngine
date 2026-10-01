import { ScreenCrashBoundary } from '@/components/ui/ScreenCrashBoundary';
import type { ReactElement } from 'react';

import { EpisodeDetailScreen } from '@/screens/EpisodeDetailScreen';

export default function EpisodeShareRoute(): ReactElement {
  return (
    <ScreenCrashBoundary screen="e/[episodeId]">
      <EpisodeDetailScreen />
    </ScreenCrashBoundary>
  );
}
