import { ScreenCrashBoundary } from '@/components/ui/ScreenCrashBoundary';
import type { ReactElement } from 'react';

import { PodcastScreen } from '@/screens/PodcastScreen';

export default function PodcastRoute(): ReactElement {
  return (
    <ScreenCrashBoundary screen="podcast">
      <PodcastScreen />
    </ScreenCrashBoundary>
  );
}
