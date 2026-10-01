import { ScreenCrashBoundary } from '@/components/ui/ScreenCrashBoundary';
import type { ReactElement } from 'react';

import { EpisodeDetailScreen } from '@/screens/EpisodeDetailScreen';

export default function EpisodeDetailRoute(): ReactElement {
  return (
    <ScreenCrashBoundary screen="podcast/[episodeId]">
      <EpisodeDetailScreen />
    </ScreenCrashBoundary>
  );
}
